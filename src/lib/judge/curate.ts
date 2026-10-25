import { z } from "zod";

// Judge-facing content comes only from an explicit allowlist (data/judge-demo.json,
// see ADR 0020), checked against what is really in the library. Nothing is picked
// because it is newest, and anything that fails a check is reported, not replaced.

export const judgeDemoSchema = z.object({
  /** Time Machine session to feature. */
  night: z.string().min(1).nullable().default(null),
  /** Recordings that may appear in the showcase, in display order; `label` replaces the filename. */
  recordings: z
    .array(z.union([z.string().min(1).transform((id) => ({ id, label: null })), z.object({ id: z.string().min(1), label: z.string().min(1).nullable().default(null) })]))
    .default([]),
  /** Lines someone really said; the first one found verbatim in an approved recording is used. */
  recall: z.array(z.string().min(1)).default([]),
  /** Multi-POV group to show. */
  pov: z.string().min(1).nullable().default(null),
  /** Story Studio project to open. */
  story: z.string().min(1).nullable().default(null),
  /** Finished exports of that story that judge mode may list; no others are shown. */
  exports: z.array(z.string().min(1)).default([]),
  /** Refuse server writes that touch any approved item (see judgeLocked in src/server/judge/demo.ts). */
  lock: z.boolean().default(false),
});

export type JudgeDemoConfig = z.infer<typeof judgeDemoSchema>;

export type SyncSource = "anchor" | "clock" | "audio" | "manual";

export type DemoFacts = {
  recordings: Map<string, { id: string; title: string; playable: boolean; hasPoster: boolean; durationMs: number }>;
  /** `momentRecordingIds`: the recording of each of the session's moments. */
  sessions: Map<string, { id: string; title: string; momentRecordingIds: string[] }>;
  /** Unflagged transcript lines. */
  lines: { text: string; recordingId: string; startMs: number }[];
  povGroups: Map<string, { recordingId: string; offsetMs: number; syncSource: SyncSource; confirmed: boolean }[]>;
  /** `clipIssues`: the exporter's own source checks (missing file, range outside the video). */
  stories: Map<string, { id: string; title: string; clipRecordingIds: string[]; clipIssues: string[] }>;
  /** Exports named in the approved list: whose story, whether it finished, whether the file is there. */
  exports: Map<string, { id: string; projectId: string; succeeded: boolean; fileOk: boolean }>;
};

export type DemoCheck = { area: "night" | "recording" | "recall" | "pov" | "story" | "export" | "config"; ref: string; ready: boolean; detail: string };

export type CuratedPov = {
  groupId: string;
  firstRecordingId: string;
  members: { recordingId: string; label: string }[];
  /** Confirmed only when every non-reference member was confirmed by the user. */
  status: "confirmed" | "suggested";
  /** How the offsets were set, for honest copy: shared audio, recording clocks, or by hand. */
  method: "audio" | "clock" | "manual" | "mixed";
};

export type Curated = {
  nightId: string | null;
  /** Moments in the night from approved, playable recordings (what judge Relive plays). */
  nightMoments: number;
  recordings: { id: string; label: string | null; durationMs: number }[];
  /** Every approved recording that can play: the scope for judge-mode pages and APIs. */
  allowed: string[];
  recall: { line: string; recordingId: string; startMs: number } | null;
  pov: CuratedPov | null;
  /** `exports`: approved, finished exports of this story (the only ones judge mode lists). */
  story: { id: string; title: string; clipCount: number; exported: boolean; exports: string[] } | null;
  checks: DemoCheck[];
};

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}' ]/gu, " ").replace(/\s+/g, " ").trim();

export function curate(config: JudgeDemoConfig | null, facts: DemoFacts): Curated {
  const checks: DemoCheck[] = [];
  if (!config) {
    checks.push({ area: "config", ref: "judge-demo.json", ready: false, detail: "No approved demo list; judge-facing content stays empty." });
    return { nightId: null, nightMoments: 0, allowed: [], recordings: [], recall: null, pov: null, story: null, checks };
  }

  const approved = new Map(config.recordings.map((r) => [r.id, r.label]));
  const label = (id: string) => approved.get(id) ?? facts.recordings.get(id)?.title ?? id;
  const usable = (id: string) => approved.has(id) && Boolean(facts.recordings.get(id)?.playable);

  // A night is only worth showing if Relive has something approved to play.
  let nightId: string | null = null;
  let nightMoments = 0;
  if (config.night) {
    const night = facts.sessions.get(config.night);
    const playable = night?.momentRecordingIds.filter(usable).length ?? 0;
    checks.push({
      area: "night",
      ref: config.night,
      ready: playable > 0,
      detail: !night
        ? "Session not found"
        : playable
          ? `${night.title} · ${playable} approved moment${playable === 1 ? "" : "s"}`
          : `${night.title}: no moments from approved, playable recordings. Run Find moments on an approved recording, or approve one that has moments.`,
    });
    if (night && playable) {
      nightId = night.id;
      nightMoments = playable;
    }
  }

  const recordings: Curated["recordings"] = [];
  for (const { id, label: l } of config.recordings) {
    const r = facts.recordings.get(id);
    const ready = Boolean(r?.playable && r.hasPoster);
    checks.push({
      area: "recording",
      ref: id,
      ready,
      detail: !r ? "Recording not found" : !r.playable ? `${l ?? r.title}: video not playable` : !r.hasPoster ? `${l ?? r.title}: no poster` : (l ?? r.title),
    });
    if (r && ready) recordings.push({ id, label: l, durationMs: r.durationMs });
  }

  let recall: Curated["recall"] = null;
  for (const line of config.recall) {
    const hit = facts.lines.find((s) => norm(s.text) === norm(line) && usable(s.recordingId));
    checks.push({
      area: "recall",
      ref: line,
      ready: Boolean(hit),
      detail: hit ? `Said in ${label(hit.recordingId)}` : "Not found verbatim in an approved, playable recording",
    });
    if (hit && !recall) recall = { line: hit.text.replace(/\s+/g, " ").trim(), recordingId: hit.recordingId, startMs: hit.startMs };
  }

  let pov: CuratedPov | null = null;
  if (config.pov) {
    const members = [...(facts.povGroups.get(config.pov) ?? [])].sort((a, b) => a.offsetMs - b.offsetMs);
    const blocked = members.filter((m) => !usable(m.recordingId));
    const ready = members.length >= 2 && blocked.length === 0;
    const others = members.filter((m) => m.syncSource !== "anchor");
    const methods = new Set(others.map((m) => m.syncSource as Exclude<SyncSource, "anchor">));
    const status = others.length > 0 && others.every((m) => m.confirmed) ? "confirmed" : "suggested";
    checks.push({
      area: "pov",
      ref: config.pov,
      ready,
      detail: !members.length
        ? "POV group not found"
        : members.length < 2
          ? "Needs at least two POVs"
          : blocked.length
            ? `Unapproved or unplayable: ${blocked.map((m) => m.recordingId).join(", ")}`
            : `${members.map((m) => label(m.recordingId)).join(" + ")} · sync ${status}`,
    });
    if (ready) {
      pov = {
        groupId: config.pov,
        firstRecordingId: members[0].recordingId,
        members: members.map((m) => ({ recordingId: m.recordingId, label: label(m.recordingId) })),
        status,
        method: methods.size === 1 ? [...methods][0] : "mixed",
      };
    }
  }

  // Exports are listed only if approved, finished, on disk and of the approved story.
  const exports: string[] = [];
  for (const id of config.exports) {
    const e = facts.exports.get(id);
    const ok = Boolean(e && e.projectId === config.story && e.succeeded && e.fileOk);
    checks.push({
      area: "export",
      ref: id,
      ready: ok,
      detail: !e ? "Export not found" : e.projectId !== config.story ? "Not an export of the approved story" : !e.succeeded ? "Not finished" : !e.fileOk ? "File missing" : "Finished · file present",
    });
    if (ok) exports.push(id);
  }

  let story: Curated["story"] = null;
  if (config.story) {
    const s = facts.stories.get(config.story);
    const blocked = s?.clipRecordingIds.filter((id) => !usable(id)) ?? [];
    const ready = Boolean(s && s.clipRecordingIds.length > 0 && blocked.length === 0 && s.clipIssues.length === 0);
    checks.push({
      area: "story",
      ref: config.story,
      ready,
      detail: !s
        ? "Story not found"
        : !s.clipRecordingIds.length
          ? `${s.title}: no clips`
          : blocked.length
            ? `${s.title}: clips from unapproved or unplayable recordings`
            : s.clipIssues.length
              ? `${s.title}: ${s.clipIssues.join(" ")}`
              : `${s.title} · ${s.clipRecordingIds.length} clip${s.clipRecordingIds.length === 1 ? "" : "s"}${exports.length ? ` · ${exports.length} approved export${exports.length === 1 ? "" : "s"}` : " · no approved export"}`,
    });
    if (s && ready) story = { id: s.id, title: s.title, clipCount: s.clipRecordingIds.length, exported: exports.length > 0, exports };
  }

  const allowed = config.recordings.map((r) => r.id).filter(usable);
  return { nightId, nightMoments, allowed, recordings, recall, pov, story, checks };
}
