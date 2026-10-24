// Relive This Night: a pure playback state machine over chronological moments.
// The player component only reflects this state onto one <video>.

export type ReliveState = {
  index: number;
  count: number;
  playing: boolean;
  /** Moments that couldn't be played (missing/unplayable video). */
  failed: number[];
  done: boolean;
  exited: boolean;
};

export type ReliveAction =
  | { type: "toggle" }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "next" }
  | { type: "prev" }
  | { type: "jump"; index: number }
  /** The current moment reached its end. */
  | { type: "ended" }
  /** The current moment's video failed to load or play. */
  | { type: "error" }
  | { type: "restart" }
  | { type: "exit" };

export const initialRelive = (count: number): ReliveState => ({ index: 0, count, playing: count > 0, failed: [], done: count === 0, exited: false });

export function reliveReducer(s: ReliveState, a: ReliveAction): ReliveState {
  if (s.exited) return s;
  const go = (i: number): ReliveState => (i >= s.count ? { ...s, done: true, playing: false } : { ...s, index: Math.max(0, i), done: false, playing: true });
  switch (a.type) {
    case "toggle":
      return s.done ? s : { ...s, playing: !s.playing };
    case "pause":
      return { ...s, playing: false };
    case "resume":
      return s.done ? s : { ...s, playing: true };
    case "next":
    case "ended":
      return go(s.index + 1);
    case "prev":
      return s.done ? { ...s, done: false, playing: true } : go(s.index - 1);
    case "jump":
      return a.index >= 0 && a.index < s.count ? go(a.index) : s;
    case "error":
      return { ...go(s.index + 1), failed: s.failed.includes(s.index) ? s.failed : [...s.failed, s.index] };
    case "restart":
      return { ...initialRelive(s.count), failed: s.failed };
    case "exit":
      return { ...s, playing: false, exited: true };
  }
}
