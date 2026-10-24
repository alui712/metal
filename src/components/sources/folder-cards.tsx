"use client";

import { CheckCircle2, FolderOpen, FolderSearch, LoaderCircle, Pause, Play, RefreshCw, RotateCcw, Trash2, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";
import { plural } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Field, SourceCard, inputClass, type SourceState } from "./source-card";
import { addFolder, folderAction, pickFolder, removeFolder, useFolders, type FolderView, type FoldersSnapshot } from "./use-folders";

const FOLDER_RULES = [
  "Imports videos already in the folder, then new ones as they appear",
  "Waits until a file has finished writing, and checks it’s a real video",
  "Skips files it has already imported, even after a rename",
  "Read-only: never moves, renames, or deletes your files",
];

const noop = () => () => {};

function ago(t: number, now: number) {
  const s = Math.max(0, Math.round((now - t) / 1000));
  return s < 5 ? "just now" : s < 60 ? `${s} s ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`;
}

/** Card-level status from the folders it shows. */
function cardState(snap: FoldersSnapshot | null, folders: FolderView[]): SourceState {
  if (!snap) return "checking";
  if (!folders.length) return "empty";
  if (!snap.workerOnline) return "worker-offline";
  if (folders.some((f) => f.state === "unavailable" || f.state === "denied")) return "attention";
  if (folders.every((f) => f.status === "paused")) return "paused";
  return "watching";
}

/** Generic + OBS-output folders. */
export function WatchedFoldersCard() {
  const snap = useFolders();
  const folders = snap?.folders.filter((f) => f.kind !== "medal") ?? [];
  const obsWatched = folders.some((f) => f.kind === "obs");
  return (
    <SourceCard
      id="folders"
      icon={FolderSearch}
      title="Watched folders"
      state={cardState(snap, folders)}
      description="Point METAL at folders where recordings land — OBS’s output folder, another recorder, or an external drive."
    >
      <FolderList snap={snap} folders={folders} empty="No folders watched yet" />
      <ul className="mt-4 space-y-2">
        {FOLDER_RULES.map((r) => (
          <li key={r} className="flex items-start gap-2.5 text-[13px] text-ink-muted">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ink-faint" aria-hidden />
            {r}
          </li>
        ))}
      </ul>
      <AddFolder kind="generic" idPrefix="folder" obsFolder={!obsWatched ? (snap?.obsFolder ?? null) : null} />
    </SourceCard>
  );
}

/** A local Medal clips folder — read like any other folder, no Medal account or API. */
export function MedalFolderCard() {
  const snap = useFolders();
  const folders = snap?.folders.filter((f) => f.kind === "medal") ?? [];
  return (
    <SourceCard
      id="medal"
      icon={FolderOpen}
      title="Medal recordings folder"
      state={cardState(snap, folders)}
      description={
        <>
          Already clip with Medal? Choose the folder where Medal saves clips on this computer and METAL will import them.
          No Medal account, sign-in, or cloud access — METAL only reads the video files.
        </>
      }
    >
      <FolderList snap={snap} folders={folders} empty="No Medal folder chosen" />
      {!folders.length && (
        <AddFolder kind="medal" idPrefix="medal" hint="Find it in Medal’s settings under the clips/recordings location. METAL isn’t affiliated with Medal and never changes Medal’s files." />
      )}
    </SourceCard>
  );
}

function FolderList({ snap, folders, empty }: { snap: FoldersSnapshot | null; folders: FolderView[]; empty: string }) {
  if (!snap) return <div className="h-20 animate-pulse rounded-2xl border border-line bg-surface/40" aria-hidden />;
  return (
    <div aria-live="polite">
      {!snap.workerOnline && folders.length > 0 && (
        <p className="mb-3 flex items-start gap-2 rounded-xl border border-warn/30 bg-warn/10 px-3 py-2 text-[12.5px] text-warn">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden /> The background worker isn’t running, so folders aren’t being watched. Start it
          with npm run worker — anything added meanwhile is picked up when it starts.
        </p>
      )}
      {folders.length ? (
        <ul className="space-y-3">
          {folders.map((f) => (
            <FolderRow key={f.id} f={f} now={snap.fetchedAt} />
          ))}
        </ul>
      ) : (
        <div className="rounded-2xl border border-dashed border-line-strong px-4 py-6 text-center text-[13px] text-ink-faint">{empty}</div>
      )}
    </div>
  );
}

const STATE_TEXT: Record<FolderView["state"], { text: string; tone: string; dot: string }> = {
  pending: { text: "Starting…", tone: "text-ink-muted", dot: "bg-ink-faint" },
  scanning: { text: "Scanning…", tone: "text-accent-ink", dot: "bg-accent animate-pulse" },
  watching: { text: "Watching", tone: "text-ok", dot: "bg-ok" },
  unavailable: { text: "Folder unavailable", tone: "text-danger", dot: "bg-danger" },
  denied: { text: "No permission", tone: "text-danger", dot: "bg-danger" },
  paused: { text: "Paused", tone: "text-warn", dot: "bg-warn" },
};

function FolderRow({ f, now }: { f: FolderView; now: number }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const st = STATE_TEXT[f.state];
  const c = f.counts;

  async function act(name: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(name);
    setError(null);
    const res = await fn();
    if (!res.ok) setError(res.error ?? "That didn’t work.");
    setBusy(null);
  }

  const spin = (name: string) => busy === name && <LoaderCircle className="size-3.5 animate-spin" aria-hidden />;

  return (
    <li className="rounded-2xl border border-line bg-surface/50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[14px] font-medium text-ink">
            <span aria-hidden className={cn("size-2 shrink-0 rounded-full", st.dot)} />
            {f.label}
          </p>
          <p className="mt-1 truncate font-mono text-[12px] text-ink-faint" title={f.displayPath}>
            {f.displayPath}
          </p>
        </div>
        <p className={cn("text-[12.5px] font-medium", st.tone)}>
          {f.rescanPending && f.state !== "paused" ? "Rescan queued…" : st.text}
          {f.state === "watching" && f.lastScanAt && <span className="font-normal text-ink-faint"> · checked {ago(f.lastScanAt, now)}</span>}
        </p>
      </div>

      {f.error && (f.state === "unavailable" || f.state === "denied") && (
        <p role="alert" className="mt-3 flex items-start gap-2 text-[12.5px] leading-relaxed text-danger">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {f.error}
        </p>
      )}

      <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-ink-muted">
        <div className="flex gap-1">
          <dt className="sr-only">In library</dt>
          <dd>
            <span className="font-medium text-ink tabular-nums">{c.imported}</span> in library
          </dd>
        </div>
        {c.processing > 0 && (
          <div className="flex items-center gap-1 text-accent-ink">
            <dt className="sr-only">Importing</dt>
            <dd className="flex items-center gap-1">
              <LoaderCircle className="size-3 animate-spin" aria-hidden /> {c.processing} importing
            </dd>
          </div>
        )}
        {c.failed + c.invalid > 0 && (
          <div className="text-danger">
            <dt className="sr-only">Not imported</dt>
            <dd>{plural(c.failed + c.invalid, "file")} couldn’t be imported</dd>
          </div>
        )}
        {c.missing > 0 && (
          <div className="text-ink-faint">
            <dt className="sr-only">Missing</dt>
            <dd>{c.missing} no longer in folder</dd>
          </div>
        )}
      </dl>

      {f.problems.length > 0 && (
        <ul className="mt-2 space-y-1 text-[12px] text-ink-faint">
          {f.problems.map((p) => (
            <li key={p.name} className="truncate">
              <span className="text-ink-muted">{p.name}</span> — {p.error}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {confirm ? (
          <>
            <span className="text-[12.5px] text-ink-muted">Stop watching? Imported recordings and the folder itself stay untouched.</span>
            <Button size="sm" variant="secondary" onClick={() => act("remove", () => removeFolder(f.id))} disabled={busy !== null}>
              {spin("remove")} Stop watching
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="secondary" onClick={() => act("rescan", () => folderAction(f.id, "rescan"))} disabled={busy !== null || f.status === "paused"}>
              {spin("rescan") || <RefreshCw className="size-3.5" aria-hidden />} Rescan
            </Button>
            {f.status === "paused" ? (
              <Button size="sm" variant="ghost" onClick={() => act("resume", () => folderAction(f.id, "resume"))} disabled={busy !== null}>
                {spin("resume") || <Play className="size-3.5" aria-hidden />} Resume
              </Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => act("pause", () => folderAction(f.id, "pause"))} disabled={busy !== null}>
                {spin("pause") || <Pause className="size-3.5" aria-hidden />} Pause
              </Button>
            )}
            {c.failed + c.invalid > 0 && (
              <Button size="sm" variant="ghost" onClick={() => act("retry", () => folderAction(f.id, "retry"))} disabled={busy !== null}>
                {spin("retry") || <RotateCcw className="size-3.5" aria-hidden />} Retry failed
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setConfirm(true)} aria-label={`Stop watching ${f.label}`}>
              <Trash2 className="size-3.5" aria-hidden /> Remove
            </Button>
            {c.imported > 0 && (
              <Link href="/library" className="ml-auto text-[12.5px] font-medium text-accent-ink hover:text-white">
                View in Library →
              </Link>
            )}
          </>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-[12.5px] text-danger">
          {error}
        </p>
      )}
    </li>
  );
}

function AddFolder({ kind, idPrefix, obsFolder = null, hint }: { kind: FolderView["kind"]; idPrefix: string; obsFolder?: string | null; hint?: string }) {
  const [path, setPath] = useState("");
  const [busy, setBusy] = useState<null | "add" | "pick" | "obs">(null);
  const [error, setError] = useState<string | null>(null);
  const isMac = useSyncExternalStore(noop, () => /Mac/i.test(navigator.userAgent), () => false);

  async function add(body: Parameters<typeof addFolder>[0], which: "add" | "obs") {
    setBusy(which);
    setError(null);
    const res = await addFolder(body);
    setBusy(null);
    if (!res.ok) setError(res.error);
    else setPath("");
  }

  async function pick() {
    setBusy("pick");
    setError(null);
    const res = await pickFolder();
    setBusy(null);
    if (!res.ok) setError(res.error);
    else if (res.path) setPath(res.path);
  }

  const inputId = `${idPrefix}-path`;
  return (
    <div className="mt-6 rounded-2xl border border-line bg-surface/50 p-4">
      {obsFolder && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
          <p className="min-w-0 text-[12.5px] text-ink-muted">
            OBS saves to <span className="break-all font-mono text-ink">{obsFolder}</span>
          </p>
          <Button size="sm" variant="secondary" onClick={() => add({ useObsFolder: true, kind: "obs" }, "obs")} disabled={busy !== null}>
            {busy === "obs" && <LoaderCircle className="size-3.5 animate-spin" aria-hidden />} Watch OBS’s folder
          </Button>
        </div>
      )}
      <form
        aria-label={kind === "medal" ? "Add Medal folder" : "Add a folder"}
        onSubmit={(e) => {
          e.preventDefault();
          void add({ path, kind }, "add");
        }}
      >
        <Field
          label={kind === "medal" ? "Medal clips folder" : "Folder"}
          htmlFor={inputId}
          hint={hint ?? "Browsers can’t share folder paths, so choose it below or paste its full path."}
        >
          <div className="flex gap-2">
            <input
              id={inputId}
              className={cn(inputClass, "font-mono text-[13px]")}
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder={kind === "medal" ? "~/Movies/Medal" : "~/Movies/Recordings"}
              autoComplete="off"
              spellCheck={false}
            />
            {isMac && (
              <Button type="button" variant="secondary" onClick={pick} disabled={busy !== null} className="shrink-0">
                {busy === "pick" ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <FolderOpen className="size-4" aria-hidden />} Choose…
              </Button>
            )}
          </div>
        </Field>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={busy !== null || !path.trim()}>
            {busy === "add" && <LoaderCircle className="size-4 animate-spin" aria-hidden />} Watch this folder
          </Button>
          <p className="text-[12px] text-ink-faint">METAL only reads it. Existing videos are imported too.</p>
        </div>
      </form>
      {busy === "pick" && <p className="mt-2 text-[12.5px] text-accent-ink">A folder chooser opened on this Mac — it may be behind your browser.</p>}
      {error && (
        <p role="alert" className="mt-2 text-[12.5px] leading-relaxed text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
