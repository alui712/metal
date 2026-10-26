import type { Metadata } from "next";
import { FlaskConical } from "lucide-react";
import { PovViewer } from "@/components/pov/pov-viewer";
import { DemoBadge, Notice } from "@/components/ui/demo-badge";
import { PageContainer } from "@/components/ui/page";
import demo from "@/lib/pov/demo-pov.json";
import type { PovGroupView, PovMember } from "@/lib/pov/types";

export const metadata: Metadata = { title: "Multi-POV · Demo" };

// Two synthetic clips of one fictional moment (scripts/public-demo/make-pov-demo.mts):
// no real gameplay, voices or players. Kai's offset is what METAL's audio sync
// measured on them when the demo was built; nothing is measured here.
const measured = demo.measured;
const member = (name: "you" | "kai", m: Partial<PovMember>): PovMember => ({
  recordingId: `rec_demo_${name}`,
  title: name === "you" ? "Sector 7 — overtime (your POV)" : "Sector 7 — overtime (Kai’s POV)",
  playerName: name === "you" ? "You" : "Kai",
  game: "Gridlock Arena",
  offsetMs: 0,
  durationMs: demo.members.find((x) => x.name === name)!.durationMs,
  fps: 30,
  recordedAt: null,
  syncSource: "anchor",
  syncConfirmed: true,
  audioScore: null,
  videoUrl: `/demo/pov/${name}.mp4`,
  posterUrl: `/demo/pov/${name}.jpg`,
  ...m,
});
const kaiOffset = measured?.offsetMs ?? demo.generatedOffsetMs;
const members = [
  member("you", {}),
  member("kai", { offsetMs: kaiOffset, syncSource: measured ? "audio" : "manual", audioScore: measured?.score ?? null }),
];
const group: PovGroupView = {
  id: "pov_demo",
  members,
  startMs: 0,
  endMs: Math.max(...members.map((m) => m.offsetMs + m.durationMs)),
};

export default function PovDemoPage() {
  return (
    <PageContainer className="pb-24">
      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-[12px] font-medium uppercase tracking-[0.24em] text-accent-ink">Multi-POV</p>
          <DemoBadge label="Synthetic demo clips" />
        </div>
        <h1 className="mt-2 text-[clamp(1.75rem,3.2vw,2.5rem)] font-semibold leading-tight tracking-[-0.03em] text-ink">Same moment, every angle.</h1>
      </header>
      <Notice className="mb-5">
        <FlaskConical className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          Two clips generated for this demo (no real gameplay or players), sharing one voice track and flashing at the same moments.{" "}
          {measured
            ? `METAL’s audio sync measured Kai’s POV starting ${(measured.offsetMs / 1000).toFixed(1)} s after yours when the demo was built (they were generated ${(demo.generatedOffsetMs / 1000).toFixed(1)} s apart).`
            : `They were generated ${(demo.generatedOffsetMs / 1000).toFixed(1)} s apart.`}{" "}
          Playback and switching are live here; the sync isn’t re-measured.
        </span>
      </Notice>
      <PovViewer initial={group} backHref="/showcase" judge />
    </PageContainer>
  );
}
