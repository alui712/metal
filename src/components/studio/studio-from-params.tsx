"use client";

import { useSearchParams } from "next/navigation";
import { getMemoryRepository } from "@/lib/memory/repository";
import { seedProject } from "@/lib/studio/seed";
import { RealStudio } from "./real-studio";
import { StoriesHome } from "./stories-home";
import { StudioEditor } from "./studio-editor";
import type { StudioLibrary } from "./types";

const repo = getMemoryRepository();

const library: StudioLibrary = {
  source: "demo",
  recordings: Object.fromEntries(repo.recordings().map((r) => [r.id, r])),
  moments: Object.fromEntries(repo.topMoments(1000).map((m) => [m.id, m])),
  gameNames: Object.fromEntries(repo.games().map((g) => [g.id, g.name])),
};

/** `?story=`: a saved story on your recordings. `?session=` / `?demo=1`: the demo editor. Neither: your stories. */
export function StudioFromParams() {
  const sessionId = useSearchParams().get("session");
  const project = seedProject(repo, sessionId);
  const candidates = project.sourceSessionId
    ? repo.momentsForSession(project.sourceSessionId)
    : repo.topMoments(1000);
  const params = useSearchParams();
  const story = params.get("story");
  if (story) return <RealStudio key={story} storyId={story} />;
  // The demo editor: ?session=<demo id> or ?demo=1. Otherwise, your saved stories.
  if (!sessionId && params.get("demo") !== "1") return <StoriesHome />;
  const session = project.sourceSessionId ? repo.session(project.sourceSessionId) : undefined;
  // Re-seed when the source changes.
  return (
    <StudioEditor
      key={project.id}
      initial={project}
      library={library}
      candidates={candidates}
      sourceSession={session ? { href: `/sessions/${session.id}`, title: session.title } : undefined}
    />
  );
}
