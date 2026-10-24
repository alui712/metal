import { cn } from "@/lib/cn";

const hueFor = (name: string) => [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

/** Overlapping initials for the people in a session. */
export function FriendStack({ names, className }: { names: string[]; className?: string }) {
  return (
    <span className={cn("inline-flex items-center", className)} aria-label={`With ${names.join(", ")}`}>
      {names.map((n, i) => (
        <span
          key={n}
          aria-hidden
          title={n}
          className="grid size-7 place-items-center rounded-full text-[11px] font-semibold text-white ring-2 ring-bg"
          style={{ marginLeft: i ? -8 : 0, background: `hsl(${hueFor(n)} 45% 32%)` }}
        >
          {n[0]}
        </span>
      ))}
    </span>
  );
}
