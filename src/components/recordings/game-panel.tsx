"use client";

import { Gamepad2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { GAMES } from "@/lib/games/catalog";

const HEADERS = { "Content-Type": "application/json", "x-metal-action": "1" };

// Client mirror of GET/PUT /api/recordings/:id/game.
type View = { game: string | null; known: boolean; genres: string[] };

/** Recording page: the game you set on this recording, so Recall can find it by game or genre. */
export function GamePanel({ recordingId }: { recordingId: string }) {
  const [view, setView] = useState<View | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/recordings/${recordingId}/game`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<View>) : null))
      .then((v) => alive && v && setView(v))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [recordingId]);

  async function save(game: string | null) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/recordings/${recordingId}/game`, { method: "PUT", headers: HEADERS, body: JSON.stringify({ game }) }).catch(() => null);
    if (res?.ok) {
      setView((await res.json()) as View);
      setEditing(false);
    } else setError(((await res?.json().catch(() => null)) as { error?: string } | null)?.error ?? "Couldn’t save the game.");
    setBusy(false);
  }

  if (!view) return null;
  return (
    <section aria-labelledby="game-heading" className="rounded-2xl border border-line bg-surface-2/60 p-4 text-[13px]">
      <h2 id="game-heading" className="flex items-center gap-2 text-[13px] font-semibold text-ink">
        <Gamepad2 className="size-4 text-accent-ink" aria-hidden /> Game
      </h2>
      {editing ? (
        <form
          className="mt-2 flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void save(draft.trim() || null);
          }}
        >
          <label htmlFor="game-input" className="text-ink-muted">What game is this? Pick from the list or type its name.</label>
          <input
            id="game-input"
            list="game-list"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={80}
            autoFocus
            autoComplete="off"
            className="h-9 rounded-lg border border-line bg-surface-2 px-2.5 text-ink outline-none focus:border-accent/50"
          />
          <datalist id="game-list">
            {GAMES.map((g) => (
              <option key={g.name} value={g.name} />
            ))}
          </datalist>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
            <Button size="sm" variant="ghost" type="button" onClick={() => setEditing(false)} disabled={busy}>Cancel</Button>
          </div>
        </form>
      ) : (
        <div className="mt-1.5">
          <p className="text-ink">{view.game ?? <span className="text-ink-muted">Not set</span>}</p>
          <p className="mt-1 leading-relaxed text-ink-faint">
            {!view.game
              ? "Set it so Recall can find this recording by game or genre, like “Valorant” or “first person shooter”. METAL never guesses it from the video."
              : view.known && view.genres.length
                ? `Recall finds it by name, and as a ${view.genres.join(", ")} (from METAL’s game list).`
                : view.known
                  ? "Recall finds it by name."
                  : "Recall finds it by name. It isn’t in METAL’s game list, so it won’t match genre searches."}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => (setDraft(view.game ?? ""), setEditing(true))}>
              {view.game ? "Change" : "Set game"}
            </Button>
            {view.game && (
              <Button size="sm" variant="ghost" onClick={() => save(null)} disabled={busy}>
                Clear
              </Button>
            )}
          </div>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-danger">{error}</p>}
    </section>
  );
}
