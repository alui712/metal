// Picks a spoken line to suggest as a Recall search: one that was really said
// (so it matches), short enough to read at a glance, and fine to show a judge.

const BLOCKED = /\b(fuck\w*|shit\w*|bitch\w*|cunt\w*|dick\w*|ass(hole)?|damn\w*|hell|bastard\w*|retard\w*|f[a@]g\w*|n[i1]gg\w*)\b/i;

export function pickRecallLine(lines: string[]): string | null {
  for (const raw of lines) {
    const text = raw.replace(/\s+/g, " ").trim();
    const words = text.split(" ").filter((w) => /[a-z]/i.test(w));
    if (words.length < 4 || words.length > 8) continue;
    if (BLOCKED.test(text)) continue;
    // Repeated callouts ("Go, go, go, go") read as noise, not a memory.
    if (new Set(words.map((w) => w.toLowerCase().replace(/[^a-z']/g, ""))).size < words.length - 1) continue;
    return text;
  }
  return null;
}
