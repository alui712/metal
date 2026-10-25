// The guided judge tour: four stops, each pointing at approved real content
// when it passed its checks (see src/lib/judge/curate.ts) and at the feature's
// own page when it didn't. Tips describe that content and controls that exist
// on that page; they never claim more than the data shows.

export type TourTargets = {
  /** The approved line and the approved recording it was said in (the search is scoped to it). */
  recall: { line: string; recordingId: string } | null;
  night: { id: string; title: string } | null;
  pov: { groupId: string; recordingId: string; members: number; status: "confirmed" | "suggested"; method: "audio" | "clock" | "manual" | "mixed" } | null;
  story: { id: string; clipCount: number; exported: boolean } | null;
};

export type TourStepId = "recall" | "timemachine" | "pov" | "studio";

export type TourStep = {
  id: TourStepId;
  label: string;
  title: string;
  tip: string;
  href: string;
  /** The page this step is about, the query values it must carry, and ones that would change the result. */
  match: { path: string; params?: Record<string, string>; forbid?: string[]; also?: RegExp };
};

const METHOD: Record<NonNullable<TourTargets["pov"]>["method"], string> = {
  audio: "aligned by their shared game audio",
  clock: "aligned by their recording clocks",
  manual: "lined up by hand",
  mixed: "aligned by audio, clocks and hand",
};

/** Judge mode: the destination page filters to approved content on the server (see scope.ts). */
const J = "judge=1";

export function tourSteps(t: TourTargets): TourStep[] {
  const pov = t.pov;
  const r = t.recall;
  const keys = pov ? (pov.members === 2 ? "1 or 2" : `1–${Math.min(pov.members, 6)}`) : "";
  return [
    {
      id: "recall",
      label: "Recall",
      title: "Search what was said",
      tip: r
        ? `This searches real voice chat for “${r.line}”. Click a result: it plays from that exact second.`
        : "No demo line is prepared. Type anything someone said in a recording; a result plays from that exact second.",
      href: r ? `/recall?q=${encodeURIComponent(r.line)}&recording=${r.recordingId}&${J}` : "/recall",
      match: r ? { path: "/recall", params: { q: r.line, recording: r.recordingId, judge: "1" }, forbid: ["game", "from", "to"] } : { path: "/recall" },
    },
    {
      id: "timemachine",
      label: "Time Machine",
      title: "Relive the whole night",
      tip: t.night
        ? `${t.night.title}, in the order it happened. Press “Relive this night” to play its moments back to back.`
        : "No demo night is prepared. Recordings are grouped into the nights you played; open one to walk through it.",
      href: t.night ? `/sessions/${t.night.id}?${J}` : "/sessions",
      match: t.night ? { path: `/sessions/${t.night.id}`, params: { judge: "1" }, also: new RegExp(`^/sessions/${t.night.id}/relive$`) } : { path: "/sessions" },
    },
    {
      id: "pov",
      label: "Multi-POV",
      title: "Every angle, one moment",
      tip: pov
        ? `${pov.members} players’ recordings of one match, ${METHOD[pov.method]}${pov.status === "confirmed" ? " and confirmed" : " (suggested, not confirmed)"}. Press ${keys} to switch POV, V for side by side.`
        : "No demo POV pair is prepared. Open a recording and press “Find other POVs” to pair a friend’s recording.",
      href: pov ? `/povs/${pov.groupId}?rec=${pov.recordingId}&${J}` : "/library",
      // Any POV of the pair counts (1/2 switch in place); a `t` would start somewhere else.
      match: pov ? { path: `/povs/${pov.groupId}`, params: { judge: "1" }, forbid: ["t"] } : { path: "/library" },
    },
    {
      id: "studio",
      label: "Story Studio",
      title: "Cut it into a story",
      tip: t.story
        ? `A story cut from real footage (${t.story.clipCount} clip${t.story.clipCount === 1 ? "" : "s"}). Reorder, trim and caption it; in the demo these edits are a preview and aren’t saved.${t.story.exported ? " Export shows the approved MP4 rendered on this computer." : ""}`
        : "No demo story is prepared. Start one from a night or a moment; Export renders an MP4 on this computer.",
      href: t.story ? `/studio?story=${t.story.id}&${J}` : "/studio",
      match: t.story ? { path: "/studio", params: { story: t.story.id, judge: "1" } } : { path: "/studio" },
    },
  ];
}

/** Whether the current page is this step's destination (not merely the same section). */
export function onStep(step: TourStep, pathname: string | null, search: URLSearchParams | null = null): boolean {
  if (!pathname) return false;
  const { path, params, forbid, also } = step.match;
  if (pathname !== path && !also?.test(pathname)) return false;
  return Object.entries(params ?? {}).every(([k, v]) => search?.get(k) === v) && !(forbid ?? []).some((k) => search?.has(k));
}

/** Full-screen pages where the dock would cover playback controls. */
export function dockHidden(pathname: string | null): boolean {
  return !!pathname && /^\/sessions\/[^/]+\/relive$/.test(pathname);
}
