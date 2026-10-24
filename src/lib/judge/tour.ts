// The guided judge tour: four stops, each pointing at real content when it
// exists (see src/server/judge/spotlight.ts) and at the feature's own page
// when it doesn't. Tips describe controls that exist on that page.

export type TourTargets = {
  recallLine: string | null;
  nightId: string | null;
  povGroupId: string | null;
  povRecordingId: string | null;
  storyId: string | null;
};

export type TourStepId = "recall" | "timemachine" | "pov" | "studio";

export type TourStep = {
  id: TourStepId;
  label: string;
  title: string;
  tip: string;
  href: string;
  /** Pages under this path count as being on the step. */
  base: string;
};

export function tourSteps(t: TourTargets): TourStep[] {
  return [
    {
      id: "recall",
      label: "Recall",
      title: "Search what was said",
      tip: t.recallLine
        ? `This searches real voice chat for “${t.recallLine}”. Click a result: it plays from that exact second.`
        : "Type anything someone said in a recording. Click a result to play that exact second.",
      href: t.recallLine ? `/recall?q=${encodeURIComponent(t.recallLine)}` : "/recall",
      base: "/recall",
    },
    {
      id: "timemachine",
      label: "Time Machine",
      title: "Relive the whole night",
      tip: t.nightId
        ? "One real night, in the order it happened. Press “Relive this night” to play its moments back to back."
        : "Recordings are grouped into the nights you played. Open one to walk through its moments.",
      href: t.nightId ? `/sessions/${t.nightId}` : "/sessions",
      base: "/sessions",
    },
    {
      id: "pov",
      label: "Multi-POV",
      title: "Every angle, one moment",
      tip:
        t.povGroupId && t.povRecordingId
          ? "Two players’ recordings of one match, synced by shared audio. Press 1 or 2 to switch POV, V for side by side."
          : "No synced POVs yet. Open a recording and press “Find other POVs” to pair a friend’s recording.",
      href: t.povGroupId && t.povRecordingId ? `/povs/${t.povGroupId}?rec=${t.povRecordingId}` : "/library",
      base: t.povGroupId ? "/povs" : "/library",
    },
    {
      id: "studio",
      label: "Story Studio",
      title: "Cut it into a story",
      tip: "Reorder and trim clips, add captions, then Export renders a real MP4 on this computer.",
      href: t.storyId ? `/studio?story=${t.storyId}` : "/studio",
      base: "/studio",
    },
  ];
}

export function onStep(step: TourStep, pathname: string | null): boolean {
  return !!pathname && (pathname === step.base || pathname.startsWith(`${step.base}/`));
}
