import { FlaskConical } from "lucide-react";
import { isPublicDemo } from "@/server/public-demo";

/** Public online demo only: says up front what the demo is and isn't. */
export function DemoBanner() {
  if (!isPublicDemo()) return null;
  return (
    <div role="note" className="border-b border-line bg-surface-2/80 px-4 py-2 text-center text-[12.5px] text-ink-muted">
      <FlaskConical className="mr-1.5 inline size-3.5 align-[-2px] text-accent-ink" aria-hidden />
      <span className="font-medium text-ink">Online demo · read-only.</span> Approved sample recordings, already indexed. Recording, importing, editing and exports run in the local app.
    </div>
  );
}
