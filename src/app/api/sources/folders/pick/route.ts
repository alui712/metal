import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { jsonError, privileged } from "@/server/http";

const run = promisify(execFile);

/**
 * Opens the native macOS folder chooser on this computer (browsers can't
 * reveal folder paths). Fixed script, no user input reaches the command.
 * Returns the chosen path to prefill the form; nothing is saved until the
 * user confirms.
 */
export async function POST(request: Request) {
  const denied = privileged(request);
  if (denied) return denied;
  if (process.platform !== "darwin") return jsonError(501, "The folder chooser is only available on macOS. Paste the folder path instead.");
  try {
    const { stdout } = await run(
      "/usr/bin/osascript",
      ["-e", 'POSIX path of (choose folder with prompt "Choose a folder for METAL to watch (read-only)")'],
      { timeout: 120_000 },
    );
    const chosen = stdout.trim().replace(/\/$/, "");
    return chosen ? Response.json({ path: chosen }) : Response.json({ cancelled: true });
  } catch (err) {
    const e = err as { stderr?: string; killed?: boolean };
    if (e.stderr?.includes("-128")) return Response.json({ cancelled: true });
    return jsonError(500, e.killed ? "The folder chooser timed out." : "Couldn’t open the folder chooser. Paste the folder path instead.");
  }
}
