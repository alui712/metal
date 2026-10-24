"use client";

import { ArrowRight, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SUGGESTED_QUERIES } from "@/lib/memory/repository";

/** Universal memory search entry: submits to Recall. */
export function HeroSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");

  return (
    <div className="w-full max-w-2xl">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          const q = query.trim();
          router.push(q ? `/recall?q=${encodeURIComponent(q)}` : "/recall");
        }}
        className="group flex items-center gap-3 rounded-2xl border border-white/12 bg-black/45 py-2 pl-5 pr-2 shadow-[0_30px_80px_-30px_rgb(0_0_0/0.9)] backdrop-blur-xl transition-colors focus-within:border-accent/50 hover:border-white/20"
      >
        <Search className="size-5 shrink-0 text-accent-ink" strokeWidth={1.75} aria-hidden />
        <label htmlFor="hero-search" className="sr-only">
          Search your memories
        </label>
        <input
          id="hero-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ask your memories — “the round we almost lost”"
          autoComplete="off"
          className="h-11 min-w-0 flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-ink-faint"
        />
        <button
          type="submit"
          aria-label="Search"
          className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent text-white transition-colors hover:bg-accent-strong"
        >
          <ArrowRight className="size-5" strokeWidth={2} aria-hidden />
        </button>
      </form>
      <ul className="mt-4 flex flex-wrap gap-2" aria-label="Try asking">
        {SUGGESTED_QUERIES.slice(0, 3).map((q) => (
          <li key={q}>
            <Link
              href={`/recall?q=${encodeURIComponent(q)}`}
              className="inline-flex h-8 items-center rounded-full border border-white/10 bg-black/30 px-3 text-[13px] text-white/70 backdrop-blur transition-colors hover:border-white/25 hover:text-white"
            >
              {q}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
