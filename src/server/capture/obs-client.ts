import { createHash, randomUUID } from "node:crypto";

// Minimal obs-websocket v5 client (JSON protocol). Uses Node's built-in
// WebSocket; the socket factory is injectable so tests can drive the
// protocol without OBS. https://github.com/obsproject/obs-websocket/blob/master/docs/generated/protocol.md

export type SocketLike = {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: { code: number; reason: string }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
};
export type SocketFactory = (url: string, protocol: string) => SocketLike;

const OP = { Hello: 0, Identify: 1, Identified: 2, Event: 5, Request: 6, RequestResponse: 7 } as const;
/** Event subscriptions: General (1) | Config (2) | Outputs (64). */
const EVENT_SUBSCRIPTIONS = 1 | 2 | 64;

export class ObsAuthError extends Error {
  constructor(message = "OBS rejected the password.") {
    super(message);
    this.name = "ObsAuthError";
  }
}
export class ObsConnectionError extends Error {
  name = "ObsConnectionError";
}
export class ObsRequestError extends Error {
  constructor(
    public requestType: string,
    public code: number,
    comment: string | undefined,
  ) {
    super(comment || `OBS request ${requestType} failed (code ${code})`);
    this.name = "ObsRequestError";
  }
}

/** base64(sha256(base64(sha256(password + salt)) + challenge)) */
export function authResponse(password: string, salt: string, challenge: string): string {
  const secret = createHash("sha256").update(password + salt).digest("base64");
  return createHash("sha256").update(secret + challenge).digest("base64");
}

const defaultFactory: SocketFactory = (url, protocol) => new WebSocket(url, protocol) as unknown as SocketLike;

type Pending = { resolve: (v: Record<string, unknown>) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> };

export class ObsClient {
  private socket: SocketLike | null = null;
  private pending = new Map<string, Pending>();
  private listeners = new Map<string, Set<(data: Record<string, unknown>) => void>>();
  private closeListeners = new Set<(info: { code: number; reason: string }) => void>();
  connected = false;
  rpcVersion = 0;

  constructor(private factory: SocketFactory = defaultFactory) {}

  /** Opens the socket and completes Hello → Identify → Identified. */
  connect(url: string, password: string | null, timeoutMs = 5000): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const fail = (err: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.socket?.close();
        reject(err);
      };
      const timer = setTimeout(() => fail(new ObsConnectionError("Timed out connecting to OBS.")), timeoutMs);

      let socket: SocketLike;
      try {
        socket = this.factory(url, "obswebsocket.json");
      } catch {
        fail(new ObsConnectionError("Invalid OBS address."));
        return;
      }
      this.socket = socket;
      socket.onerror = () => fail(new ObsConnectionError("Couldn’t reach OBS. Is it running with the WebSocket server enabled?"));
      socket.onclose = (ev) => {
        const wasConnected = this.connected;
        this.connected = false;
        for (const p of this.pending.values()) {
          clearTimeout(p.timer);
          p.reject(new ObsConnectionError("OBS disconnected."));
        }
        this.pending.clear();
        if (!settled) {
          // 4009 AuthenticationFailed; 4010 UnsupportedRpcVersion.
          if (ev.code === 4009) fail(new ObsAuthError());
          else if (ev.code === 4010) fail(new ObsConnectionError("This OBS version’s WebSocket protocol isn’t supported (needs OBS 28+)."));
          else fail(new ObsConnectionError("Couldn’t reach OBS. Is it running with the WebSocket server enabled?"));
        }
        if (wasConnected) for (const l of this.closeListeners) l(ev);
      };
      socket.onmessage = (ev) => {
        let msg: { op: number; d: Record<string, unknown> };
        try {
          msg = JSON.parse(String(ev.data));
        } catch {
          return;
        }
        if (msg.op === OP.Hello) {
          const auth = msg.d.authentication as { challenge: string; salt: string } | undefined;
          if (auth && !password) {
            fail(new ObsAuthError("OBS requires a password."));
            return;
          }
          socket.send(
            JSON.stringify({
              op: OP.Identify,
              d: {
                rpcVersion: 1,
                eventSubscriptions: EVENT_SUBSCRIPTIONS,
                ...(auth && password ? { authentication: authResponse(password, auth.salt, auth.challenge) } : {}),
              },
            }),
          );
        } else if (msg.op === OP.Identified) {
          this.connected = true;
          this.rpcVersion = Number(msg.d.negotiatedRpcVersion) || 1;
          settled = true;
          clearTimeout(timer);
          resolve();
        } else if (msg.op === OP.Event) {
          const type = String(msg.d.eventType);
          for (const l of this.listeners.get(type) ?? []) l((msg.d.eventData as Record<string, unknown>) ?? {});
        } else if (msg.op === OP.RequestResponse) {
          const p = this.pending.get(String(msg.d.requestId));
          if (!p) return;
          this.pending.delete(String(msg.d.requestId));
          clearTimeout(p.timer);
          const status = msg.d.requestStatus as { result: boolean; code: number; comment?: string };
          if (status?.result) p.resolve((msg.d.responseData as Record<string, unknown>) ?? {});
          else p.reject(new ObsRequestError(String(msg.d.requestType), status?.code ?? 0, status?.comment));
        }
      };
    });
  }

  request<T = Record<string, unknown>>(requestType: string, requestData?: Record<string, unknown>, timeoutMs = 10_000): Promise<T> {
    const socket = this.socket;
    if (!socket || !this.connected) return Promise.reject(new ObsConnectionError("Not connected to OBS."));
    const requestId = randomUUID();
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new ObsConnectionError(`OBS didn’t answer ${requestType} in time.`));
      }, timeoutMs);
      this.pending.set(requestId, { resolve: resolve as Pending["resolve"], reject, timer });
      socket.send(JSON.stringify({ op: OP.Request, d: { requestType, requestId, ...(requestData ? { requestData } : {}) } }));
    });
  }

  on(eventType: string, handler: (data: Record<string, unknown>) => void): () => void {
    if (!this.listeners.has(eventType)) this.listeners.set(eventType, new Set());
    this.listeners.get(eventType)!.add(handler);
    return () => this.listeners.get(eventType)?.delete(handler);
  }

  onClose(handler: (info: { code: number; reason: string }) => void): () => void {
    this.closeListeners.add(handler);
    return () => this.closeListeners.delete(handler);
  }

  close(): void {
    this.connected = false;
    this.socket?.close(1000);
    this.socket = null;
  }
}
