"use client";

import { motion, useReducedMotion } from "motion/react";
import { Clapperboard, Copy, Ellipsis, Film, LoaderCircle, Pencil, Play, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button, buttonClass } from "@/components/ui/button";
import { EASE_OUT } from "@/components/ui/motion";
import { timecode } from "@/lib/format";
import { Modal } from "./dialogs";
import type { ExportView } from "./real-export";

type Story = { id: string; title: string; aspect: string; clipCount: number; durationMs: number; createdAt: number; updatedAt: number; coverUrl: string | null; lastExport: ExportView | null };

const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
const HEADERS = { "Content-Type": "application/json", "x-metal-action": "1" };

/** Saved stories on your recordings; new ones start in Time Machine or Recall. */
export function StoriesHome() {
  const reduce = useReducedMotion();
  const [stories, setStories] = useState<Story[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [action, setAction] = useState<{ kind: "rename" | "delete"; story: Story } | null>(null);
  const [pending, setPending] = useState(false);
  const [title, setTitle] = useState("");
  const load = useCallback(async () => {
    setLoadError(false);
    const res = await fetch("/api/stories", { cache: "no-store" }).catch(() => null);
    if (!res?.ok) {
      setLoadError(true);
      return;
    }
    setStories(((await res.json()) as { stories: Story[] }).stories);
  }, []);
  useEffect(() => {
    let alive = true;
    fetch("/api/stories", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((j: { stories: Story[] }) => alive && setStories(j.stories))
      .catch(() => alive && setLoadError(true));
    return () => {
      alive = false;
    };
  }, []);

  function openRename(story: Story) {
    setTitle(story.title);
    setAction({ kind: "rename", story });
  }

  async function rename() {
    if (!action || action.kind !== "rename") return;
    setPending(true);
    const res = await fetch(`/api/stories/${action.story.id}`, { method: "PATCH", headers: HEADERS, body: JSON.stringify({ title }) }).catch(() => null);
    if (res?.ok) {
      setAction(null);
      setNotice({ kind: "ok", text: "Story renamed." });
      await load();
    } else {
      const body = res ? ((await res.json().catch(() => ({}))) as { error?: string }) : {};
      setNotice({ kind: "error", text: body.error ?? "Couldn’t rename the story." });
    }
    setPending(false);
  }

  async function duplicate(story: Story) {
    setPending(true);
    const res = await fetch(`/api/stories/${story.id}/duplicate`, { method: "POST", headers: HEADERS }).catch(() => null);
    if (res?.ok) {
      setNotice({ kind: "ok", text: `Duplicated “${story.title}”.` });
      await load();
    } else {
      const body = res ? ((await res.json().catch(() => ({}))) as { error?: string }) : {};
      setNotice({ kind: "error", text: body.error ?? "Couldn’t duplicate the story." });
    }
    setPending(false);
  }

  async function remove() {
    if (!action || action.kind !== "delete") return;
    setPending(true);
    const res = await fetch(`/api/stories/${action.story.id}`, { method: "DELETE", headers: HEADERS }).catch(() => null);
    if (res?.ok) {
      setAction(null);
      setNotice({ kind: "ok", text: "Story and its exports deleted. Original recordings were kept." });
      await load();
    } else {
      const body = res ? ((await res.json().catch(() => ({}))) as { error?: string }) : {};
      setNotice({ kind: "error", text: body.error ?? "Couldn’t delete the story." });
    }
    setPending(false);
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[clamp(1.9rem,4vw,3rem)] font-semibold leading-tight tracking-[-0.03em] text-ink">
            Your stories, <span className="font-display font-normal italic text-accent-ink">cut together.</span>
          </h1>
          <p className="mt-2 max-w-xl text-[14.5px] text-ink-muted">Start a story from a Time Machine session, a Recall result, or a Smart Clip suggestion — then arrange, trim, preview and export a real MP4 from your recordings.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/sessions" className={buttonClass("primary", "md")}>
            <Clapperboard className="size-4" aria-hidden /> Start from Time Machine
          </Link>
          <Link href="/studio?demo=1" className={buttonClass("ghost", "md")}>
            Try the demo editor
          </Link>
        </div>
      </div>

      {notice && (
        <p role={notice.kind === "error" ? "alert" : "status"} className={`mt-6 rounded-xl border px-4 py-3 text-[13px] ${notice.kind === "error" ? "border-danger/25 bg-danger/10 text-danger" : "border-ok/25 bg-ok/10 text-ok"}`}>
          {notice.text}
        </p>
      )}

      {loadError ? (
        <div role="alert" className="mt-10 flex flex-wrap items-center gap-3 text-[14px] text-danger">
          Couldn’t load your stories. <Button size="sm" variant="secondary" onClick={load}>Try again</Button>
        </div>
      ) : !stories ? (
        <div aria-busy="true" aria-label="Loading stories" className="mt-10 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="aspect-[4/3] animate-pulse rounded-3xl bg-surface-2/70" />
          ))}
        </div>
      ) : stories.length === 0 ? (
        <div className="mt-10 rounded-3xl border border-dashed border-line-strong px-6 py-14 text-center">
          <Film className="mx-auto size-7 text-accent-ink" strokeWidth={1.5} aria-hidden />
          <p className="mt-4 text-[16px] font-medium text-ink">No stories yet</p>
          <p className="mx-auto mt-1.5 max-w-md text-[13.5px] text-ink-muted">
            Turn your best moments into a story. Select moments from a session, begin with a line you found in Recall, or choose Send to Story Studio on a Smart Clip suggestion.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Link href="/sessions" className={buttonClass("primary", "md")}><Clapperboard className="size-4" aria-hidden /> Browse sessions</Link>
            <Link href="/recall" className={buttonClass("secondary", "md")}><Search className="size-4" aria-hidden /> Search Recall</Link>
          </div>
        </div>
      ) : (
        <ul className="mt-10 grid gap-5 sm:grid-cols-2 xl:grid-cols-3" aria-label="Stories">
          {stories.map((s, i) => (
            <motion.li key={s.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={reduce ? { duration: 0.2, y: { duration: 0 } } : { duration: 0.45, delay: Math.min(i, 6) * 0.05, ease: EASE_OUT }}>
              <article className="group relative overflow-hidden rounded-3xl border border-line bg-surface-2 transition-[border-color,transform] duration-500 ease-[var(--ease-out)] hover:-translate-y-0.5 hover:border-accent/40 focus-within:border-accent/50">
                <Link href={`/studio?story=${s.id}`} className="block focus-visible:outline-none" aria-label={`Open ${s.title}`}>
                <span className="relative block aspect-video overflow-hidden bg-surface-3">
                  {s.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- local poster
                    <img src={s.coverUrl} alt="" className="size-full object-cover transition-transform duration-700 group-hover:scale-[1.04]" />
                  ) : (
                    <Film className="absolute left-1/2 top-1/2 size-7 -translate-x-1/2 -translate-y-1/2 text-ink-faint" aria-hidden />
                  )}
                  <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                  <span className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur">
                    {s.lastExport?.status === "done" ? (
                      <>
                        <Play className="size-3 fill-current" aria-hidden /> Exported
                      </>
                    ) : s.lastExport?.status === "queued" || s.lastExport?.status === "rendering" ? (
                      <>
                        <LoaderCircle className="size-3 animate-spin" aria-hidden /> Rendering
                      </>
                    ) : s.lastExport?.status === "failed" ? (
                      "Export failed"
                    ) : (
                      "Not exported"
                    )}
                  </span>
                </span>
                <span className="block p-4">
                  <span className="block truncate pr-10 text-[15.5px] font-medium text-ink">{s.title}</span>
                  <span className="mt-1 block text-[12.5px] text-ink-faint">
                    {s.clipCount} clip{s.clipCount === 1 ? "" : "s"} · {timecode(s.durationMs)} · {s.aspect}
                  </span>
                  <span className="mt-1 block text-[11.5px] text-ink-faint">
                    Created {dateFmt.format(s.createdAt)} · Edited {dateFmt.format(s.updatedAt)}
                  </span>
                </span>
                </Link>
                <details className="absolute bottom-3.5 right-3 z-10">
                  <summary className="grid size-9 cursor-pointer list-none place-items-center rounded-lg text-ink-muted hover:bg-surface-3 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" aria-label={`Actions for ${s.title}`}>
                    <Ellipsis className="size-5" aria-hidden />
                  </summary>
                  <div className="absolute bottom-10 right-0 w-40 overflow-hidden rounded-xl border border-line-strong bg-surface p-1 shadow-xl">
                    <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] text-ink hover:bg-surface-3" onClick={() => openRename(s)}><Pencil className="size-3.5" aria-hidden /> Rename</button>
                    <button disabled={pending} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] text-ink hover:bg-surface-3 disabled:opacity-50" onClick={() => duplicate(s)}><Copy className="size-3.5" aria-hidden /> Duplicate</button>
                    <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] text-danger hover:bg-danger/10" onClick={() => setAction({ kind: "delete", story: s })}><Trash2 className="size-3.5" aria-hidden /> Delete</button>
                  </div>
                </details>
              </article>
            </motion.li>
          ))}
        </ul>
      )}

      <Modal open={action?.kind === "rename"} onOpenChange={(open) => !open && setAction(null)} title="Rename story">
        <form className="p-6" onSubmit={(event) => { event.preventDefault(); void rename(); }}>
          <label htmlFor="rename-story" className="text-[13px] font-medium text-ink">Story name</label>
          <input id="rename-story" autoFocus maxLength={80} value={title} onChange={(event) => setTitle(event.target.value)} className="mt-2 w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-[14px] text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20" />
          <div className="mt-6 flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setAction(null)}>Cancel</Button><Button type="submit" disabled={pending}>{pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}Save name</Button></div>
        </form>
      </Modal>

      <Modal open={action?.kind === "delete"} onOpenChange={(open) => !open && setAction(null)} title="Delete story?">
        <div className="p-6">
          <p className="text-[14px] leading-relaxed text-ink-muted">This permanently deletes <strong className="text-ink">{action?.story.title}</strong> and its exported videos. Original gameplay recordings and source clips are never removed.</p>
          <div className="mt-6 flex justify-end gap-2"><Button variant="ghost" onClick={() => setAction(null)}>Cancel</Button><Button variant="secondary" className="border-danger/30 text-danger hover:bg-danger/10" autoFocus disabled={pending} onClick={() => void remove()}>{pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}Delete story</Button></div>
        </div>
      </Modal>
    </div>
  );
}
