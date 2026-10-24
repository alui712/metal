"use client";

import { useSearchParams } from "next/navigation";
import { getMemoryRepository } from "@/lib/memory/repository";
import { seedProject } from "@/lib/studio/seed";
import { StudioEditor } from "./studio-editor";
import type { StudioLibrary } from "./types";

const repo = getMemoryRepository();

const library: StudioLibrary = {
  recordings: Object.fromEntries(repo.recordings().map((r) => [r.id, r])),
  moments: Object.fromEntries(repo.topMoments(1000).map((m) => [m.id, m])),
  gameNames: Object.fromEntries(repo.games().map((g) => [g.id, g.name])),
};

/** Seeds the editor from `?session=` (sent by Time Machine's "Create story"). */
export function StudioFromParams() {
  const sessionId = useSearchParams().get("session");
  const project = seedProject(repo, sessionId);
  const candidates = project.sourceSessionId
    ? repo.momentsForSession(project.sourceSessionId)
    : repo.topMoments(1000);
  // Re-seed when the source changes.
  return <StudioEditor key={project.id} initial={project} library={library} candidates={candidates} />;
}
