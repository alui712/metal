import { Upload } from "lucide-react";
import { listRecordings } from "@/server/recordings";
import { ButtonLink } from "@/components/ui/button";
import { AutoRefresh } from "./auto-refresh";
import { RecordingTile } from "./recording-tile";

/** The user's real recordings (Server Component; render inside Suspense). */
export async function YourRecordings({ limit, emptyHint = true }: { limit?: number; emptyHint?: boolean }) {
  const all = await listRecordings();
  const shown = limit ? all.slice(0, limit) : all;
  if (!shown.length) {
    return emptyHint ? (
      <div className="flex flex-col items-start gap-4 rounded-2xl border border-dashed border-line-strong px-6 py-8 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[14px] text-ink-muted">No recordings yet. Import videos and they’ll show up here, ready to watch.</p>
        <ButtonLink href="/import" variant="secondary" size="sm">
          <Upload className="size-4" aria-hidden /> Import videos
        </ButtonLink>
      </div>
    ) : null;
  }
  return (
    <>
      {shown.some((r) => r.status === "imported" || r.status === "processing") && <AutoRefresh />}
      <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {shown.map((r) => (
          <li key={r.id}>
            <RecordingTile recording={r} />
          </li>
        ))}
      </ul>
    </>
  );
}

export function RecordingsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4" aria-busy="true" aria-label="Loading recordings">
      {Array.from({ length: count }, (_, i) => (
        <li key={i}>
          <div className="aspect-video animate-pulse rounded-xl bg-surface-3" />
          <div className="mt-3 h-4 w-2/3 animate-pulse rounded bg-surface-3" />
        </li>
      ))}
    </ul>
  );
}
