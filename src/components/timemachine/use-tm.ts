"use client";

const HEADERS = { "Content-Type": "application/json", "x-metal-action": "1" };

/** Privileged JSON call; returns an error message or null. */
export async function tmSend(url: string, method: string, body?: unknown): Promise<{ error: string | null; json: unknown }> {
  try {
    const res = await fetch(url, { method, headers: HEADERS, body: body === undefined ? undefined : JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    return { error: res.ok ? null : ((json as { error?: string }).error ?? `Failed (${res.status})`), json };
  } catch {
    return { error: "Couldn’t reach the METAL server.", json: null };
  }
}
