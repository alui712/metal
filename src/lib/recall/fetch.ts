// Client fetch for /api/recall: rejects with the server's own message on an
// error response, and with a plain explanation when the server is unreachable.
export async function recallFetch<T>(url: string, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store", signal });
  } catch (e) {
    if (signal?.aborted) throw e;
    throw new Error("the METAL server isn’t responding");
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : `server error ${res.status}`;
    throw new Error(msg);
  }
  if (body === null) throw new Error("the server sent an unreadable answer");
  return body as T;
}
