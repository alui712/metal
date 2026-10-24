"use client";

import { ArrowLeft, Clapperboard, Columns2, LoaderCircle, Pause, Play, Square, Volume2, VolumeX } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Scrubber } from "@/components/media/scrubber";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/controls";
import { cn } from "@/lib/cn";
import { timecode } from "@/lib/format";
import { coverage, frameMs, nearestCovered, signedSeconds, toOwnTime } from "@/lib/pov/sync";
import type { PovGroupView, PovMember } from "@/lib/pov/types";
import { SYNC_LABEL, SyncChip } from "./pov-panel";

const HEADERS = { "Content-Type": "application/json", "x-metal-action": "1" };
/** Followers drift-correct by rate inside this window and re-seek outside it. */
const SEEK_DRIFT_MS = 250;
const PAUSED_DRIFT_MS = 30;
const CLIP_BEFORE_MS = 5_000;
const CLIP_AFTER_MS = 5_000;

type Mode = "switch" | "side";
type TileState = { waiting: boolean; error: boolean };

const nameOf = (m: PovMember) => m.playerName ?? m.title;

/**
 * Synced Multi-POV playback. One clock (group time) drives every POV, shown or
 * hidden (so switching is instant): the
 * audible POV leads while it has footage, the others follow (rate nudges for
 * small drift, re-seek for large), and POVs without footage at that moment
 * wait with an honest overlay. Only one POV is ever audible.
 */
export function PovViewer({ initial, focusId, startOwnMs, backHref }: { initial: PovGroupView; focusId?: string; startOwnMs?: number; backHref: string }) {
  const router = useRouter();
  const [group, setGroup] = useState(initial);
  const members = group.members;
  const playableIds = members.filter((m) => m.videoUrl).map((m) => m.recordingId);
  const [activeId, setActiveId] = useState(() => (focusId && playableIds.includes(focusId) ? focusId : (playableIds[0] ?? members[0].recordingId)));
  const [mode, setMode] = useState<Mode>("switch");
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [tiles, setTiles] = useState<Record<string, TileState>>({});
  const [blocked, setBlocked] = useState(false);
  const active = members.find((m) => m.recordingId === activeId) ?? members[0];

  // Group time lives in a ref (driven every frame) and is mirrored to state for rendering.
  const initialT = (() => {
    const f = members.find((m) => m.recordingId === activeId)!;
    return startOwnMs !== undefined ? f.offsetMs + startOwnMs : f.offsetMs;
  })();
  const tRef = useRef(initialT);
  const [t, setT] = useState(initialT);
  const videos = useRef(new Map<string, HTMLVideoElement>());
  const state = useRef({ playing, activeId, mode, members, muted });
  useEffect(() => {
    state.current = { playing, activeId, mode, members, muted };
  });

  /** Puts every POV exactly at group time T (no drift allowed). */
  const alignAll = useCallback((T: number) => {
    for (const m of state.current.members) {
      const v = videos.current.get(m.recordingId);
      if (!v || v.readyState < 1) continue;
      const own = Math.min(Math.max(0, toOwnTime(m, T)), m.durationMs);
      if (Math.abs(v.currentTime * 1000 - own) > 5) v.currentTime = own / 1000;
    }
  }, []);

  const seek = useCallback(
    (T: number) => {
      const c = Math.min(Math.max(T, group.startMs), group.endMs);
      tRef.current = c;
      setT(c);
      alignAll(c);
    },
    [group.startMs, group.endMs, alignAll],
  );

  // The clock: the audible POV leads while it's playing footage; otherwise wall time advances.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let lastUi = 0;
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      const { playing: on, activeId: lead, members: ms, muted: mute } = state.current;
      const leader = ms.find((m) => m.recordingId === lead);
      const lv = videos.current.get(lead);
      let T = tRef.current;
      if (on && leader) {
        const leading = lv && coverage(leader, T) === "inside" && !lv.paused && lv.readyState >= 2 && !lv.seeking;
        if (leading) T = lv.currentTime * 1000 + leader.offsetMs;
        else if (!(lv && coverage(leader, T) === "inside" && (lv.seeking || lv.readyState < 3))) T += dt;
        if (T >= group.endMs) {
          T = group.endMs;
          setPlaying(false);
        }
      }
      tRef.current = T;
      for (const m of ms) {
        const v = videos.current.get(m.recordingId);
        if (!v) continue;
        v.muted = mute || m.recordingId !== lead;
        // Hidden POVs keep following (muted) so switching is instant.
        if (!m.videoUrl || v.readyState < 1) {
          if (!v.paused) v.pause();
          continue;
        }
        const own = toOwnTime(m, T);
        if (own < 0 || own > m.durationMs) {
          if (!v.paused) v.pause();
          // Waiting at the edge it will play from.
          const edge = own < 0 ? 0 : m.durationMs;
          if (Math.abs(v.currentTime * 1000 - edge) > 100 && !v.seeking) v.currentTime = edge / 1000;
          continue;
        }
        const drift = v.currentTime * 1000 - own;
        if (on) {
          if (v.paused && !v.ended)
            void v.play().catch((e: DOMException) => {
              // Autoplay with sound can be refused until the viewer interacts.
              if (e.name === "NotAllowedError") {
                setBlocked(true);
                setPlaying(false);
              }
            });
          if (m.recordingId === lead) continue;
          if (Math.abs(drift) > SEEK_DRIFT_MS) {
            if (!v.seeking) v.currentTime = own / 1000;
          } else v.playbackRate = Math.min(1.05, Math.max(0.95, 1 - drift / 2000));
        } else {
          if (!v.paused) v.pause();
          v.playbackRate = 1;
          if (Math.abs(drift) > PAUSED_DRIFT_MS && !v.seeking) v.currentTime = own / 1000;
        }
      }
      if (now - lastUi > 66) {
        lastUi = now;
        setT(T);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [group.endMs]);

  const toggle = useCallback(() => {
    setBlocked(false);
    if (!playing && tRef.current >= group.endMs - 50) seek(group.startMs);
    setPlaying((p) => !p);
  }, [playing, group.endMs, group.startMs, seek]);

  /** Switch POV: the new POV shows the same moment (it's seeked before it's revealed). */
  const switchTo = useCallback(
    (id: string) => {
      const m = members.find((x) => x.recordingId === id);
      if (!m?.videoUrl) return;
      const v = videos.current.get(id);
      const own = toOwnTime(m, tRef.current);
      if (v && v.readyState >= 1 && own >= 0 && own <= m.durationMs) v.currentTime = own / 1000;
      setActiveId(id);
    },
    [members],
  );

  // Keyboard: Space play/pause · ←/→ 5 s · 1–6 switch POV · M mute · V view.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("input,select,textarea")) return;
      if (e.key === " " && !el.closest("button,a")) {
        e.preventDefault();
        toggle();
      } else if (e.key === "ArrowRight" && !el.closest('[role="slider"],[role="radiogroup"]')) seek(tRef.current + 5000);
      else if (e.key === "ArrowLeft" && !el.closest('[role="slider"],[role="radiogroup"]')) seek(tRef.current - 5000);
      else if (/^[1-6]$/.test(e.key)) {
        const m = members[Number(e.key) - 1];
        if (m) switchTo(m.recordingId);
      } else if (e.key === "m" || e.key === "M") setMuted((x) => !x);
      else if (e.key === "v" || e.key === "V") setMode((x) => (x === "switch" ? "side" : "switch"));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, seek, switchTo, members]);

  // Re-align when the layout changes (newly visible tiles start at the shared moment).
  useEffect(() => {
    alignAll(tRef.current);
  }, [mode, activeId, alignAll]);

  const setTile = (id: string, patch: Partial<TileState>) => setTiles((cur) => ({ ...cur, [id]: { ...(cur[id] ?? { waiting: false, error: false }), ...patch } }));

  // A media error can fire before hydration attaches onError: check what the elements already know.
  useEffect(() => {
    const t = setTimeout(() => {
      const failed = [...videos.current].filter(([, v]) => v.error).map(([id]) => id);
      if (failed.length) setTiles((cur) => ({ ...cur, ...Object.fromEntries(failed.map((id) => [id, { waiting: false, error: true }])) }));
    }, 0);
    return () => clearTimeout(t);
  }, []);

  // ── Sync edits ──
  const [saving, setSaving] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function post(body: object) {
    const res = await fetch("/api/povs", { method: "POST", headers: HEADERS, body: JSON.stringify(body) }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { group?: PovGroupView | null; error?: string } | null;
    if (!res?.ok) {
      setNotice(data?.error ?? "Couldn’t save that change.");
      return null;
    }
    return data;
  }

  function nudge(m: PovMember, deltaMs: number) {
    const next = Math.round(m.offsetMs + deltaMs);
    setGroup((g) => recompute({ ...g, members: g.members.map((x) => (x.recordingId === m.recordingId ? { ...x, offsetMs: next, syncSource: x.syncSource === "anchor" ? "anchor" : "manual", syncConfirmed: true } : x)) }));
    setSaving(m.recordingId);
    if (pending.current) clearTimeout(pending.current);
    pending.current = setTimeout(async () => {
      await post({ action: "offset", recordingId: m.recordingId, offsetMs: next });
      setSaving(null);
    }, 450);
  }
  // A nudge moves that POV against the shared clock: re-align it at the same group time.
  useEffect(() => {
    state.current.members = group.members;
    alignAll(tRef.current);
  }, [group, alignAll]);

  async function confirm(m: PovMember) {
    const d = await post({ action: "confirm", recordingId: m.recordingId });
    if (d?.group) setGroup(d.group);
  }

  async function rename(m: PovMember, name: string) {
    if ((m.playerName ?? "") === name.trim()) return;
    const d = await post({ action: "name", recordingId: m.recordingId, name: name.trim() || null });
    if (d) setGroup((g) => ({ ...g, members: g.members.map((x) => (x.recordingId === m.recordingId ? { ...x, playerName: name.trim().slice(0, 40) || null } : x)) }));
  }

  async function unpair(m: PovMember) {
    const d = await post({ action: "unpair", recordingId: m.recordingId });
    if (!d) return;
    if (!d.group) router.push(backHref);
    else {
      setGroup(d.group);
      if (m.recordingId === activeId) setActiveId(d.group.members.find((x) => x.videoUrl)?.recordingId ?? d.group.members[0].recordingId);
    }
  }

  // ── Studio handoff ──
  const [clipping, setClipping] = useState(false);
  const activeOwn = toOwnTime(active, t);
  const activeCovers = coverage(active, t) === "inside";
  async function clipToStudio() {
    setClipping(true);
    setNotice(null);
    const inMs = Math.max(0, Math.round(activeOwn - CLIP_BEFORE_MS));
    const outMs = Math.min(active.durationMs, Math.round(activeOwn + CLIP_AFTER_MS));
    const res = await fetch("/api/stories", {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({ sessionId: null, ranges: [{ recordingId: active.recordingId, inMs, outMs }], title: `${nameOf(active)} POV` }),
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { id?: string; error?: string } | null;
    if (res?.ok && data?.id) router.push(`/studio?story=${data.id}`);
    else {
      setNotice(data?.error ?? "Couldn’t start a story.");
      setClipping(false);
    }
  }

  const span = group.endMs - group.startMs;
  const pct = (ms: number) => `${((ms - group.startMs) / Math.max(1, span)) * 100}%`;
  const others = members.filter((m) => m.recordingId !== activeId);

  return (
    <div className="space-y-5" role="region" aria-label="Synced POVs">
      <div className="flex flex-wrap items-center gap-3">
        <Link href={backHref} className="inline-flex items-center gap-2 rounded-lg py-1 text-[13px] font-medium text-ink-muted hover:text-ink">
          <ArrowLeft className="size-4" aria-hidden /> Back
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <Segmented<Mode>
            label="View"
            value={mode}
            onChange={setMode}
            options={[
              { value: "switch", label: <span className="inline-flex items-center gap-1.5 px-1"><Square className="size-3.5" aria-hidden /> One POV</span> },
              { value: "side", label: <span className="inline-flex items-center gap-1.5 px-1"><Columns2 className="size-3.5" aria-hidden /> Side by side</span> },
            ]}
          />
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="min-w-0">
          {/* Stage */}
          <div className={cn("relative", mode === "side" ? cn("grid gap-2", members.length > 1 && "md:grid-cols-2") : "aspect-video overflow-hidden rounded-2xl bg-black ring-1 ring-line")}>
            {members.map((m, i) => {
              const cov = coverage(m, t);
              const shown = mode === "side" || m.recordingId === activeId;
              const isActive = m.recordingId === activeId;
              const st = tiles[m.recordingId];
              return (
                <div
                  key={m.recordingId}
                  data-pov={m.recordingId}
                  data-offset={m.offsetMs}
                  data-active={isActive}
                  aria-hidden={!shown}
                  className={cn(
                    mode === "side" ? cn("relative aspect-video overflow-hidden rounded-xl bg-black ring-1", isActive ? "ring-2 ring-accent" : "ring-line") : "absolute inset-0",
                    !shown && "pointer-events-none opacity-0",
                    mode === "switch" && "transition-opacity duration-200 motion-reduce:transition-none",
                  )}
                  onClick={mode === "side" && !isActive && m.videoUrl ? () => switchTo(m.recordingId) : undefined}
                >
                  {m.videoUrl ? (
                    <video
                      ref={(el) => {
                        if (el) videos.current.set(m.recordingId, el);
                        else videos.current.delete(m.recordingId);
                      }}
                      src={m.videoUrl}
                      poster={m.posterUrl ?? undefined}
                      playsInline
                      preload="auto"
                      muted
                      aria-label={`${nameOf(m)} at ${timecode(Math.max(0, Math.min(m.durationMs, toOwnTime(m, t))))}`}
                      onLoadedMetadata={(e) => {
                        const own = toOwnTime(m, tRef.current);
                        e.currentTarget.currentTime = Math.min(Math.max(0, own), m.durationMs) / 1000;
                        setTile(m.recordingId, { error: false });
                      }}
                      onWaiting={() => setTile(m.recordingId, { waiting: true })}
                      onPlaying={() => setTile(m.recordingId, { waiting: false })}
                      onSeeked={() => setTile(m.recordingId, { waiting: false })}
                      onCanPlay={() => setTile(m.recordingId, { waiting: false })}
                      onError={() => setTile(m.recordingId, { error: true })}
                      className="absolute inset-0 size-full object-contain"
                    />
                  ) : null}
                  {(!m.videoUrl || st?.error) && (
                    <p className="absolute inset-0 grid place-items-center bg-black/85 p-4 text-center text-[13px] text-white/75" role="status">
                      {nameOf(m)}’s video is unavailable — it may have been moved or removed from the library.
                    </p>
                  )}
                  {m.videoUrl && !st?.error && cov !== "inside" && (
                    <p className="absolute inset-0 grid place-items-center bg-black/75 p-4 text-center text-[13px] text-white/80" role="status">
                      {cov === "before" ? `${nameOf(m)} starts recording in ${timecode(m.offsetMs - t)}` : `${nameOf(m)}’s recording has ended`}
                    </p>
                  )}
                  {m.videoUrl && !st?.error && cov === "inside" && st?.waiting && playing && (
                    <LoaderCircle className="absolute left-1/2 top-1/2 size-8 -translate-x-1/2 -translate-y-1/2 animate-spin text-white/80" aria-label="Buffering" />
                  )}
                  {shown && (
                    <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center gap-2 bg-gradient-to-b from-black/70 to-transparent px-3 py-2">
                      <span className="grid size-5 place-items-center rounded bg-black/60 font-mono text-[10px] text-white">{i + 1}</span>
                      <span className="min-w-0 truncate text-[12.5px] font-medium text-white">{nameOf(m)}</span>
                      {isActive && !muted && <Volume2 className="size-3.5 shrink-0 text-white/80" aria-label="Audible" />}
                      {cov === "inside" && <span className="ml-auto shrink-0 font-mono text-[11px] tabular-nums text-white/75">{timecode(toOwnTime(m, t))}</span>}
                    </div>
                  )}
                  {mode === "side" && !isActive && m.videoUrl && (
                    <span className="pointer-events-none absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-white/80">Click to listen</span>
                  )}
                </div>
              );
            })}
            {blocked && (
              <button type="button" onClick={toggle} className="absolute inset-0 z-10 grid place-items-center bg-black/40 text-[14px] font-medium text-white">
                Press play to start with sound
              </button>
            )}
          </div>

          {/* Transport */}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="button" onClick={toggle} aria-label={playing ? "Pause" : "Play"} className="grid size-10 shrink-0 place-items-center rounded-full bg-white text-black transition-transform hover:scale-105">
              {playing ? <Pause className="size-4" fill="currentColor" aria-hidden /> : <Play className="ml-0.5 size-4" fill="currentColor" aria-hidden />}
            </button>
            <button type="button" onClick={() => setMuted((x) => !x)} aria-label={muted ? "Unmute" : "Mute"} aria-pressed={muted} className="grid size-10 shrink-0 place-items-center rounded-full border border-line text-ink-muted hover:text-ink">
              {muted ? <VolumeX className="size-4" aria-hidden /> : <Volume2 className="size-4" aria-hidden />}
            </button>
            <Scrubber timeMs={t - group.startMs} durationMs={Math.max(1, span)} onSeek={(ms) => seek(group.startMs + ms)} label="Seek the shared timeline" className="min-w-[10rem] flex-1" />
            <span className="shrink-0 font-mono text-[12px] tabular-nums text-ink-muted" aria-live="off">
              {timecode(t - group.startMs)} <span className="text-ink-faint">/ {timecode(span)}</span>
            </span>
          </div>
          <p className="mt-2 text-[12px] text-ink-faint" data-pov-position>
            Hearing {nameOf(active)} · {activeCovers ? `${timecode(activeOwn)} in their recording` : "no footage at this moment"}
          </p>
          {/* Announce POV switches only; the ticking time above would repeat every second. */}
          <p className="sr-only" aria-live="polite">
            Now hearing {nameOf(active)}
            {activeCovers ? "" : ", no footage at this moment"}
          </p>

          {/* Coverage lanes: who recorded when */}
          <div className="mt-4 space-y-1.5" aria-label="Who recorded when">
            {members.map((m, i) => (
              <button
                key={m.recordingId}
                type="button"
                disabled={!m.videoUrl}
                onClick={() => {
                  switchTo(m.recordingId);
                  if (coverage(m, tRef.current) !== "inside") seek(nearestCovered(m, tRef.current));
                }}
                aria-pressed={m.recordingId === activeId}
                aria-label={`POV ${i + 1}: ${nameOf(m)}${m.videoUrl ? "" : " (unavailable)"}`}
                className="group flex w-full items-center gap-3 text-left disabled:opacity-50"
              >
                <span className={cn("w-28 shrink-0 truncate text-[12px]", m.recordingId === activeId ? "font-medium text-ink" : "text-ink-muted group-hover:text-ink")}>
                  {i + 1}. {nameOf(m)}
                </span>
                <span className="relative h-3 flex-1 rounded-full bg-surface-3">
                  <span
                    className={cn("absolute inset-y-0 rounded-full", m.recordingId === activeId ? "bg-accent" : m.syncConfirmed ? "bg-ink-faint/60" : "bg-ink-faint/35 [background-image:repeating-linear-gradient(45deg,transparent_0_4px,rgb(0_0_0/0.25)_4px_8px)]")}
                    style={{ left: pct(m.offsetMs), width: `${(m.durationMs / Math.max(1, span)) * 100}%` }}
                  />
                  <span aria-hidden className="absolute -inset-y-1 w-px bg-white" style={{ left: pct(t) }} />
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Side panel */}
        <aside className="min-w-0 space-y-4" aria-label="POVs and sync">
          <div className="overflow-hidden rounded-2xl border border-line bg-surface-2/60">
            <p className="border-b border-line px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.16em] text-ink-faint">POVs · press 1–{members.length}</p>
            <ul role="radiogroup" aria-label="Switch POV" className="divide-y divide-line">
              {members.map((m, i) => (
                <li key={m.recordingId}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={m.recordingId === activeId}
                    disabled={!m.videoUrl}
                    onClick={() => switchTo(m.recordingId)}
                    className={cn("flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors disabled:opacity-50", m.recordingId === activeId ? "bg-accent/[0.08]" : "hover:bg-surface-3/60")}
                  >
                    <span className="grid size-6 shrink-0 place-items-center rounded-md border border-line font-mono text-[11px] text-ink-muted">{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-ink">{nameOf(m)}</span>
                      <span className="block truncate text-[11.5px] text-ink-faint">{m.playerName ? m.title : m.videoUrl ? coverageLabel(m, t) : "Video unavailable"}</span>
                    </span>
                    <SyncChip confirmed={m.syncConfirmed} source={m.syncSource} />
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <SyncPanel
            key={active.recordingId}
            m={active}
            alone={members.length < 2}
            saving={saving === active.recordingId}
            onNudge={(d) => nudge(active, d)}
            onConfirm={() => confirm(active)}
            onRename={(n) => rename(active, n)}
            onUnpair={() => unpair(active)}
            compareHint={mode === "switch" && others.length > 0 ? () => setMode("side") : undefined}
          />

          <div className="rounded-2xl border border-line bg-surface-2/60 p-4">
            <Button className="w-full" onClick={clipToStudio} disabled={clipping || !activeCovers || !active.videoUrl}>
              {clipping ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Clapperboard className="size-4" aria-hidden />}
              Clip this moment to Story Studio
            </Button>
            <p className="mt-2 text-[11.5px] leading-relaxed text-ink-faint">
              {activeCovers
                ? `${nameOf(active)}’s recording, ${timecode(Math.max(0, activeOwn - CLIP_BEFORE_MS))}–${timecode(Math.min(active.durationMs, activeOwn + CLIP_AFTER_MS))}. You can trim it in the Studio.`
                : `${nameOf(active)} has no footage here — switch POV or move the playhead.`}
            </p>
          </div>
          {notice && (
            <p role="alert" className="text-[12.5px] text-danger">
              {notice}
            </p>
          )}
          <p className="text-[11.5px] leading-relaxed text-ink-faint">Space play/pause · ←/→ 5 s · 1–{members.length} switch POV · M mute · V view. Only the selected POV plays sound.</p>
        </aside>
      </div>
    </div>
  );
}

function coverageLabel(m: PovMember, t: number) {
  const c = coverage(m, t);
  return c === "inside" ? `${timecode(toOwnTime(m, t))} of ${timecode(m.durationMs)}` : c === "before" ? `Starts in ${timecode(m.offsetMs - t)}` : "Ended";
}

function recompute(g: PovGroupView): PovGroupView {
  return { ...g, startMs: Math.min(...g.members.map((m) => m.offsetMs)), endMs: Math.max(...g.members.map((m) => m.offsetMs + m.durationMs)) };
}

function SyncPanel({
  m,
  alone,
  saving,
  onNudge,
  onConfirm,
  onRename,
  onUnpair,
  compareHint,
}: {
  m: PovMember;
  alone: boolean;
  saving: boolean;
  onNudge: (deltaMs: number) => void;
  onConfirm: () => void;
  onRename: (name: string) => void;
  onUnpair: () => void;
  compareHint?: () => void;
}) {
  const [name, setName] = useState(m.playerName ?? "");
  const f = frameMs(m.fps);
  const steps: Array<[string, number, string]> = [
    ["−1 s", -1000, "1 second earlier"],
    ["−0.1", -100, "100 ms earlier"],
    ["−1f", -f, "1 frame earlier"],
    ["+1f", f, "1 frame later"],
    ["+0.1", 100, "100 ms later"],
    ["+1 s", 1000, "1 second later"],
  ];
  return (
    <div className="rounded-2xl border border-line bg-surface-2/60 p-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-ink-faint">This POV</p>
      <label className="mt-2 block">
        <span className="text-[12px] text-ink-muted">Player name</span>
        <input
          value={name}
          maxLength={40}
          placeholder={m.title}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => onRename(name)}
          onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
          className="mt-1 h-9 w-full rounded-lg border border-line bg-surface px-2.5 text-[13px] text-ink placeholder:text-ink-faint"
        />
      </label>

      <div className="mt-4 flex items-center justify-between gap-2">
        <span className="text-[12px] text-ink-muted">Sync</span>
        <SyncChip confirmed={m.syncConfirmed} source={m.syncSource} />
      </div>
      <p className="mt-1 text-[12px] text-ink-faint">
        {SYNC_LABEL[m.syncSource]}
        {m.syncSource === "audio" && m.audioScore !== null ? ` (correlation ${m.audioScore.toFixed(2)})` : ""} · starts at <span className="font-mono tabular-nums text-ink-muted">{signedSeconds(m.offsetMs)}</span>
        {saving && " · saving…"}
      </p>
      {!alone && (
        <>
          <div className="mt-3 grid grid-cols-6 gap-1" role="group" aria-label={`Nudge ${m.playerName ?? m.title}'s sync`}>
            {steps.map(([label, d, aria]) => (
              <button key={label} type="button" onClick={() => onNudge(d)} aria-label={`Shift ${aria}`} className="h-8 rounded-md border border-line bg-surface font-mono text-[11px] text-ink-muted hover:border-line-strong hover:text-ink">
                {label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11.5px] leading-relaxed text-ink-faint">
            Shifts this POV against the others. Line up a sound or a flash you can see in both.
            {compareHint && (
              <>
                {" "}
                <button type="button" onClick={compareHint} className="font-medium text-accent-ink hover:text-white">
                  Compare side by side
                </button>
              </>
            )}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {!m.syncConfirmed && (
              <Button size="sm" onClick={onConfirm}>
                Sync looks right
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={onUnpair}>
              Unpair
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
