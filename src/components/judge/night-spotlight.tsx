import Link from "next/link";
import { ArrowRight, Play } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { InView } from "@/components/ui/motion";
import { duration, plural, timecode } from "@/lib/format";
import type { Spotlight } from "@/server/judge/spotlight";

/** The home dashboard's lead: the library's strongest real night and its best moments. */
export function NightSpotlight({ night, moments }: Pick<Spotlight, "night" | "moments">) {
  if (!night) return null;
  const stats = [
    plural(night.recordingCount, "recording"),
    `${duration(night.footageMs)} of footage`,
    plural(night.momentCount, "moment"),
    ...(night.transcriptLines ? [plural(night.transcriptLines, "spoken line")] : []),
  ];
  return (
    <section
      aria-labelledby="spotlight-heading"
      className="grain relative isolate overflow-hidden rounded-[2rem] border border-line-strong bg-surface"
    >
      {night.coverUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- local keyframe
        <img src={night.coverUrl} alt="" className="absolute inset-0 -z-20 size-full object-cover opacity-55" />
      )}
      <div aria-hidden className="absolute inset-0 -z-10 bg-[linear-gradient(100deg,var(--graphite-950)_18%,rgb(7_7_9/0.86)_48%,rgb(7_7_9/0.55))]" />
      <div aria-hidden className="absolute -left-24 -top-32 -z-10 size-96 rounded-full bg-accent/25 blur-3xl" />

      <div className="grid gap-8 p-6 sm:p-9 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-end lg:gap-12 lg:p-11">
        <div>
          <p className="flex flex-wrap items-center gap-2.5 text-[12px] font-medium uppercase tracking-[0.22em] text-accent-ink">
            Featured night
            {night.approximate && (
              <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10.5px] tracking-[0.08em] text-amber-200">
                Approximate times
              </span>
            )}
          </p>
          <h2 id="spotlight-heading" className="mt-3 font-display text-[clamp(2.5rem,4.6vw,4.25rem)] leading-[0.95] tracking-[-0.02em] text-ink">
            {night.title}
          </h2>
          <ul className="mt-5 flex flex-wrap gap-2" aria-label="This night">
            {stats.map((s) => (
              <li key={s} className="rounded-full border border-line-strong bg-surface-2/70 px-3 py-1 text-[12.5px] text-ink-muted backdrop-blur">
                {s}
              </li>
            ))}
          </ul>
          <div className="mt-7 flex flex-wrap gap-3">
            <ButtonLink href={`/sessions/${night.id}`}>
              Open this night <ArrowRight className="size-4" aria-hidden />
            </ButtonLink>
            <ButtonLink href="/sessions" variant="secondary">
              All nights
            </ButtonLink>
          </div>
        </div>

        {moments.length > 0 && (
          <ol className="flex flex-col gap-2.5" aria-label={`Best moments from ${night.title}`}>
            {moments.slice(0, 3).map((m, i) => (
              <li key={m.id}>
                <InView delay={0.1 + i * 0.07} y={12}>
                  <Link
                    href={`/recordings/${m.recordingId}?t=${m.startMs}`}
                    className="group flex items-center gap-3.5 rounded-2xl border border-line bg-surface-2/75 p-2 pr-4 backdrop-blur transition-[border-color,background-color,transform] duration-300 hover:-translate-y-0.5 hover:border-accent/45 hover:bg-surface-3/85"
                  >
                    <span className="relative aspect-video w-28 shrink-0 overflow-hidden rounded-xl bg-surface-3">
                      {/* eslint-disable-next-line @next/next/no-img-element -- local keyframe */}
                      <img src={m.thumbUrl!} alt="" className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.06]" />
                      <span className="absolute inset-0 grid place-items-center bg-black/25 opacity-0 transition-opacity group-hover:opacity-100">
                        <Play className="size-4 fill-white text-white" aria-hidden />
                      </span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium text-ink">{m.title}</span>
                      <span className="mt-0.5 block font-mono text-[11.5px] text-ink-faint">
                        {timecode(m.startMs)}–{timecode(m.endMs)} · {m.confidence} signal
                      </span>
                    </span>
                  </Link>
                </InView>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
