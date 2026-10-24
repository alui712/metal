import Link from "next/link";
import { ViewTransition } from "react";
import { Play } from "lucide-react";
import type { Game, Moment, Recording, Session } from "@/lib/memory/contracts";
import { duration, formatDate, plural, timecode } from "@/lib/format";
import { cn } from "@/lib/cn";
import { SceneArt } from "@/components/media/scene-art";
import { KindTag } from "./kind";

/** Shared-element name used to morph session artwork between routes. */
export const sessionArtName = (id: string) => `session-art-${id}`;

export function MomentCard({
  moment,
  recording,
  game,
  href,
  className,
}: {
  moment: Moment;
  recording: Recording;
  game: Game | undefined;
  href: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn("group block w-full rounded-2xl outline-offset-4", className)}
    >
      <div className="relative aspect-video overflow-hidden rounded-2xl ring-1 ring-line transition-shadow duration-300 group-hover:ring-line-strong">
        <div className="absolute inset-0 transition-transform duration-700 ease-[var(--ease-out)] group-hover:scale-[1.06]">
          <SceneArt art={{ ...recording.art, seed: recording.art.seed + moment.startMs / 1000 }} />
        </div>
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
        <span className="absolute bottom-2.5 right-2.5 rounded-md bg-black/60 px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-white/90 backdrop-blur">
          {timecode(moment.startMs)}
        </span>
        <span
          aria-hidden
          className="absolute left-1/2 top-1/2 grid size-11 -translate-x-1/2 -translate-y-1/2 scale-90 place-items-center rounded-full bg-white/90 text-black opacity-0 transition-all duration-300 group-hover:scale-100 group-hover:opacity-100 group-focus-visible:opacity-100"
        >
          <Play className="ml-0.5 size-4" fill="currentColor" />
        </span>
      </div>
      <div className="mt-3 px-0.5">
        <KindTag kind={moment.kind} />
        <p className="mt-1 line-clamp-1 text-[15px] font-medium text-ink transition-colors group-hover:text-white">
          {moment.title}
        </p>
        <p className="mt-0.5 line-clamp-1 text-[13px] text-ink-faint">
          {game?.name} · {formatDate(recording.recordedAt)}
        </p>
      </div>
    </Link>
  );
}

export function SessionCard({
  session,
  game,
  momentCount,
  href,
  size = "md",
  className,
}: {
  session: Session;
  game: Game | undefined;
  momentCount: number;
  href: string;
  size?: "md" | "lg";
  className?: string;
}) {
  return (
    <Link href={href} className={cn("group block rounded-3xl outline-offset-4", className)}>
      <div
        className={cn(
          "relative overflow-hidden rounded-3xl ring-1 ring-line transition-shadow duration-300 group-hover:ring-line-strong",
          size === "lg" ? "aspect-[16/10] sm:aspect-[21/9] lg:aspect-auto lg:h-full lg:min-h-[26rem]" : "aspect-[4/3]",
        )}
      >
        <ViewTransition name={sessionArtName(session.id)} share="morph" default="none">
          <div className="absolute inset-0 transition-transform duration-[900ms] ease-[var(--ease-out)] group-hover:scale-[1.04]">
            <SceneArt art={session.art} />
          </div>
        </ViewTransition>
        <div aria-hidden className="grain absolute inset-0" />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-transparent" />
        <div className={cn("absolute inset-x-0 bottom-0", size === "lg" ? "p-6 sm:p-9" : "p-5")}>
          <p className="text-[12px] font-medium uppercase tracking-[0.18em] text-white/60">
            {game?.name} · {formatDate(session.startedAt)}
          </p>
          <h3
            className={cn(
              "mt-2 font-semibold tracking-[-0.025em] text-white",
              size === "lg" ? "text-[clamp(1.75rem,3.5vw,3rem)] leading-[1.02]" : "text-[20px] leading-tight",
            )}
          >
            {session.title}
          </h3>
          <p className="mt-2 text-[13px] text-white/60">
            {duration(session.endedAt - session.startedAt)} · {plural(momentCount, "moment")} · with{" "}
            {session.friends.join(", ")}
          </p>
        </div>
      </div>
    </Link>
  );
}

export function RecordingThumb({ recording, className }: { recording: Recording; className?: string }) {
  return (
    <div className={cn("relative aspect-video overflow-hidden rounded-xl ring-1 ring-line", className)}>
      <SceneArt art={recording.art} />
      <span className="absolute bottom-2 right-2 rounded-md bg-black/60 px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-white/90">
        {timecode(recording.durationMs)}
      </span>
    </div>
  );
}
