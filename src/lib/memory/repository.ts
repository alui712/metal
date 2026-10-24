import type {
  Game,
  Moment,
  Recording,
  SearchFilters,
  SearchResponse,
  Session,
} from "./contracts";
import * as demo from "./demo/fixtures";
import { DEMO_SEARCH_METHOD, searchMoments } from "./demo/search";

/**
 * Read API every METAL surface uses. Phase 1 ships the demo implementation
 * (pure, isomorphic — usable from Server and Client Components). Phase 2
 * adds a SQLite-backed implementation with the same contract.
 */
export interface MemoryRepository {
  readonly source: "demo" | "library";
  games(): Game[];
  game(id: string): Game | undefined;
  recordings(): Recording[];
  recording(id: string): Recording | undefined;
  sessions(): Session[];
  session(id: string): Session | undefined;
  moment(id: string): Moment | undefined;
  /** Moments of one recording, chronological. */
  momentsForRecording(recordingId: string): Moment[];
  /** Moments of a session, chronological across its recordings. */
  momentsForSession(sessionId: string): Moment[];
  /** All moments, highest score first. */
  topMoments(limit?: number): Moment[];
  search(query: string, filters?: SearchFilters): SearchResponse;
}

function createDemoRepository(): MemoryRepository {
  const games = new Map(demo.games.map((g) => [g.id, g]));
  const recordings = new Map(demo.recordings.map((r) => [r.id, r]));
  const sessions = new Map(demo.sessions.map((s) => [s.id, s]));
  const moments = new Map(demo.moments.map((m) => [m.id, m]));

  const absoluteStart = (m: Moment) => recordings.get(m.recordingId)!.recordedAt + m.startMs;

  return {
    source: "demo",
    games: () => demo.games,
    game: (id) => games.get(id),
    recordings: () => demo.recordings,
    recording: (id) => recordings.get(id),
    sessions: () => demo.sessions,
    session: (id) => sessions.get(id),
    moment: (id) => moments.get(id),
    momentsForRecording: (recordingId) =>
      demo.moments
        .filter((m) => m.recordingId === recordingId)
        .sort((a, b) => a.startMs - b.startMs),
    momentsForSession(sessionId) {
      const session = sessions.get(sessionId);
      if (!session) return [];
      const ids = new Set(session.recordingIds);
      return demo.moments
        .filter((m) => ids.has(m.recordingId))
        .sort((a, b) => absoluteStart(a) - absoluteStart(b));
    },
    topMoments: (limit = 12) =>
      [...demo.moments].sort((a, b) => b.score - a.score).slice(0, limit),
    search(query, filters) {
      const results = searchMoments(
        query,
        demo.moments,
        {
          recordingOf: (m) => recordings.get(m.recordingId)!,
          sessionOf: (m) => {
            const sessionId = recordings.get(m.recordingId)?.sessionId;
            return sessionId ? (sessions.get(sessionId) ?? null) : null;
          },
          gameNameOf: (id) => games.get(id)?.name ?? "",
        },
        filters,
      );
      return { query, results, method: DEMO_SEARCH_METHOD, source: "demo" };
    },
  };
}

let instance: MemoryRepository | undefined;

export function getMemoryRepository(): MemoryRepository {
  instance ??= createDemoRepository();
  return instance;
}

export const SUGGESTED_QUERIES = [
  "when Mira clutched the 1v3",
  "everyone laughing",
  "the final circle grenade",
  "sunrise at the summit",
  "photo finish",
  "ambush at the gate",
];
