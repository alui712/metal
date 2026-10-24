import { getDb } from "@/server/db/client";
import { jsonError, privileged, sameOrigin } from "@/server/http";
import { getLiveWorker } from "@/server/jobs/queue";
import { addFolder, checkFolder, displayPath, FOLDER_KINDS, listFolderViews, obsRecordDirectory, type FolderKind } from "@/server/sources/folders";

/** Watched folders with live scan state and counts. Paths are home-relative for display only. */
export async function GET(request: Request) {
  if (!sameOrigin(request)) return jsonError(403, "Forbidden.");
  const db = getDb();
  const obsDir = obsRecordDirectory(db);
  return Response.json(
    {
      workerOnline: Boolean(getLiveWorker(db)),
      obsFolder: obsDir ? displayPath(obsDir) : null,
      folders: listFolderViews(db),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/** Adds a folder the user explicitly chose: `{ path, kind, label? }` or `{ useObsFolder: true }`. */
export async function POST(request: Request) {
  const denied = privileged(request);
  if (denied) return denied;
  let body: { path?: unknown; kind?: unknown; label?: unknown; useObsFolder?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid request.");
  }
  const db = getDb();
  const kind = (FOLDER_KINDS as readonly string[]).includes(String(body.kind)) ? (body.kind as FolderKind) : "generic";
  const input = body.useObsFolder === true ? obsRecordDirectory(db) : body.path;
  if (body.useObsFolder === true && !input) return jsonError(409, "Connect OBS first so METAL can find its recording folder.");
  const check = checkFolder(db, input);
  if (!check.ok) return jsonError(check.denied ? 403 : 400, check.error);
  const id = addFolder(db, { real: check.real, kind: body.useObsFolder === true ? "obs" : kind, label: typeof body.label === "string" ? body.label : undefined });
  return Response.json({ id }, { status: 201 });
}
