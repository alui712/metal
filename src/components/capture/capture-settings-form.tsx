"use client";

import { Check, HardDrive, RotateCcw } from "lucide-react";
import {
  DEFAULT_SETTINGS,
  HOTKEY_ACTIONS,
  QUALITY_PRESETS,
  REPLAY_OPTIONS,
  estimateClipBytes,
  replayLabel,
  type AudioOption,
  type CaptureSettings,
  type HotkeyAction,
  type QualityPreset,
} from "@/lib/capture/settings";
import { cn } from "@/lib/cn";
import { fileSize } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Segmented, Switch } from "@/components/ui/controls";
import { HotkeyField } from "./hotkey-field";
import { saveCaptureSettings, useCaptureSettings } from "./use-capture-settings";

const AUDIO: Array<{ key: AudioOption; label: string; hint: string }> = [
  { key: "gameAudio", label: "Game audio", hint: "Everything you hear from the game." },
  { key: "microphone", label: "Microphone", hint: "Your voice and callouts." },
  { key: "separateMicTrack", label: "Microphone on its own track", hint: "Recommended — keeps transcripts and laughter detection accurate." },
  { key: "voiceChatTrack", label: "Voice chat on its own track", hint: "Separates Discord or party chat from game sound (OBS application audio capture)." },
];

function Section({ id, title, description, children }: { id: string; title: string; description: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="grid gap-6 border-t border-line py-10 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] lg:gap-12">
      <div>
        <h2 id={id} className="text-[17px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-muted">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

export function CaptureSettingsForm() {
  const settings = useCaptureSettings();

  function update(patch: Partial<CaptureSettings>) {
    saveCaptureSettings({ ...settings, ...patch });
  }
  const setHotkey = (action: HotkeyAction) => (accelerator: string) =>
    update({ hotkeys: { ...settings.hotkeys, [action]: accelerator } });

  const clipBytes = estimateClipBytes(settings.quality, settings.replaySeconds);
  const hourBytes = estimateClipBytes(settings.quality, 3600);

  return (
    <div>
      <Section id="replay-heading" title="Replay buffer" description="How far back “Save clip” reaches. OBS keeps this much gameplay in memory and only writes it to disk when you save.">
        <Segmented
          label="Replay buffer length"
          value={String(settings.replaySeconds)}
          onChange={(v) => update({ replaySeconds: Number(v) as CaptureSettings["replaySeconds"] })}
          options={REPLAY_OPTIONS.map((s) => ({ value: String(s), label: replayLabel(s) }))}
          className="flex-wrap"
        />
        <p className="mt-4 flex items-center gap-2 text-[13px] text-ink-faint">
          <HardDrive className="size-4" aria-hidden />
          About {fileSize(clipBytes)} per saved clip at {QUALITY_PRESETS[settings.quality].label} (estimate).
        </p>
      </Section>

      <Section id="quality-heading" title="Recording quality" description="Applied to OBS’s output settings. Higher quality needs more GPU headroom and disk space.">
        <div role="radiogroup" aria-labelledby="quality-heading" className="grid gap-3 sm:grid-cols-3">
          {(Object.keys(QUALITY_PRESETS) as QualityPreset[]).map((key) => {
            const p = QUALITY_PRESETS[key];
            const active = settings.quality === key;
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => update({ quality: key })}
                className={cn(
                  "relative flex flex-col items-start rounded-2xl border p-4 text-left transition-colors",
                  active ? "border-accent/60 bg-accent/10" : "border-line bg-surface-2/60 hover:border-line-strong",
                )}
              >
                {active && (
                  <span className="absolute right-3 top-3 grid size-5 place-items-center rounded-full bg-accent text-white">
                    <Check className="size-3" strokeWidth={3} aria-hidden />
                  </span>
                )}
                <span className="text-[14.5px] font-medium text-ink">{p.label}</span>
                <span className="mt-1 font-mono text-[12px] text-ink-muted">
                  {p.height}p{p.fps} · {p.videoMbps} Mbps
                </span>
                <span className="mt-3 text-[12.5px] leading-relaxed text-ink-faint">{p.hint}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <Segmented
            label="Recording file format"
            value={settings.container}
            onChange={(v) => update({ container: v })}
            options={[
              { value: "mkv", label: "MKV" },
              { value: "mp4", label: "MP4" },
            ]}
          />
          <p className="max-w-sm text-[12.5px] leading-relaxed text-ink-faint">
            {settings.container === "mkv"
              ? "MKV survives crashes and power loss. METAL makes a playable copy when it imports."
              : "MP4 plays everywhere, but a crash mid-recording can leave the file unreadable."}
          </p>
        </div>
        <p className="mt-4 text-[13px] text-ink-faint">≈ {fileSize(hourBytes)} per hour of full-session recording (estimate).</p>
      </Section>

      <Section id="hotkeys-heading" title="Hotkeys" description="Global shortcuts that work while you’re in a game. Each needs a modifier (or an F-key) so it won’t fire while you type.">
        <div className="divide-y divide-line rounded-2xl border border-line bg-surface-2/60 px-5">
          {(Object.keys(HOTKEY_ACTIONS) as HotkeyAction[]).map((a) => (
            <HotkeyField key={a} action={a} hotkeys={settings.hotkeys} onChange={setHotkey(a)} />
          ))}
        </div>
        <p className="mt-3 text-[12.5px] leading-relaxed text-ink-faint">
          Some full-screen games block global shortcuts. METAL will also listen for OBS’s own “Save Replay” hotkey, so a clip saved from OBS still shows up here.
        </p>
      </Section>

      <Section id="audio-heading" title="Audio" description="Which sound OBS records, and how it’s split into tracks. Separate tracks make transcripts and Smart Clip far more accurate.">
        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface-2/60 px-5">
          {AUDIO.map(({ key, label, hint }) => {
            const dependsOnMic = key === "separateMicTrack" && !settings.audio.microphone;
            return (
              <li key={key} className={cn("flex items-center gap-4 py-4", dependsOnMic && "opacity-50")}>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium text-ink">{label}</p>
                  <p className="text-[12.5px] text-ink-faint">{dependsOnMic ? "Turn on the microphone first." : hint}</p>
                </div>
                <Switch
                  label={label}
                  checked={settings.audio[key] && !dependsOnMic}
                  onCheckedChange={(checked) => {
                    if (dependsOnMic) return;
                    update({ audio: { ...settings.audio, [key]: checked } });
                  }}
                />
              </li>
            );
          })}
        </ul>
      </Section>

      <div className="flex justify-end border-t border-line pt-6">
        <Button variant="ghost" size="sm" onClick={() => saveCaptureSettings(DEFAULT_SETTINGS)}>
          <RotateCcw className="size-4" aria-hidden /> Reset to defaults
        </Button>
      </div>
    </div>
  );
}
