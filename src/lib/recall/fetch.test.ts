import { afterEach, describe, expect, it, vi } from "vitest";
import { recallFetch } from "./fetch";

const respond = (status: number, body: unknown) =>
  vi.stubGlobal("fetch", vi.fn(async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status })));

afterEach(() => vi.unstubAllGlobals());

describe("recallFetch", () => {
  it("returns the parsed answer", async () => {
    respond(200, { query: "hi", results: [] });
    await expect(recallFetch("/api/recall?q=hi")).resolves.toEqual({ query: "hi", results: [] });
  });

  it("surfaces the server's error message", async () => {
    respond(403, { error: "Forbidden." });
    await expect(recallFetch("/api/recall?q=hi")).rejects.toThrow("Forbidden.");
  });

  it("explains non-JSON failures and unreachable servers", async () => {
    respond(500, "<html>boom</html>");
    await expect(recallFetch("/x")).rejects.toThrow("server error 500");
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    await expect(recallFetch("/x")).rejects.toThrow("isn’t responding");
  });

  it("passes aborts through so a superseded search stays silent", async () => {
    const ctrl = new AbortController();
    vi.stubGlobal("fetch", vi.fn((_: string, init: RequestInit) => new Promise((_r, reject) => init.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))))));
    const p = recallFetch("/x", ctrl.signal);
    ctrl.abort();
    await expect(p).rejects.toThrow("aborted");
  });
});
