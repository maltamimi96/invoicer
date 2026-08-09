"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { filterNav, navSections } from "./nav-config";

interface FlatItem {
  label: string;
  href: string;
  section: string;
  icon: React.ComponentType<{ className?: string }>;
}

/**
 * The MYOB-style search in the top bar — an inline field with a dropdown of
 * matching destinations (NOT a modal). Type to filter, ↑/↓ to move, Enter to
 * go; ⌘K / Ctrl-K focuses it.
 */
export function GlobalSearch({
  workerView,
  features,
  vocab,
}: {
  workerView: boolean;
  features?: Record<string, boolean>;
  vocab?: Record<string, string> | null;
}) {
  const router = useRouter();
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const items: FlatItem[] = useMemo(() => {
    const sections = filterNav(navSections, { workerView, features });
    return sections.flatMap((s) =>
      s.items.map((i) => ({ label: vocab?.[i.href] ?? i.label, href: i.href, section: s.section, icon: i.icon })),
    );
  }, [workerView, features, vocab]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => `${i.label} ${i.section}`.toLowerCase().includes(q));
  }, [items, query]);

  useEffect(() => setHighlight(0), [query]);

  // ⌘K / Ctrl-K focuses the field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Close on outside click.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const go = (href: string) => {
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
    router.push(href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setHighlight((h) => Math.min(h + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); }
    else if (e.key === "Enter") { const r = results[highlight]; if (r) go(r.href); }
    else if (e.key === "Escape") { setOpen(false); inputRef.current?.blur(); }
  };

  // Group the visible results by section for display.
  const grouped = useMemo(() => {
    const map = new Map<string, FlatItem[]>();
    for (const r of results) {
      const arr = map.get(r.section) ?? [];
      arr.push(r);
      map.set(r.section, arr);
    }
    return Array.from(map.entries());
  }, [results]);

  let flatIndex = -1;

  return (
    <div ref={wrapRef} className="relative w-full">
      <div className="flex h-11 items-center gap-2 rounded-full border border-border bg-card px-4 text-foreground transition-colors focus-within:border-border-strong">
        <Search className="h-4 w-4 shrink-0 opacity-80" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search…"
          className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
        />
        <kbd className="ml-auto hidden rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline">
          ⌘K
        </kbd>
      </div>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-[70vh] overflow-y-auto rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-lg">
          {results.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">No matches.</p>
          ) : (
            grouped.map(([section, list]) => (
              <div key={section} className="mb-1 last:mb-0">
                <p className="px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{section}</p>
                {list.map((r) => {
                  flatIndex += 1;
                  const idx = flatIndex;
                  return (
                    <button
                      key={r.href}
                      type="button"
                      onMouseEnter={() => setHighlight(idx)}
                      onClick={() => go(r.href)}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm",
                        idx === highlight ? "bg-primary/10 text-foreground" : "text-foreground/80 hover:bg-muted",
                      )}
                    >
                      <r.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{r.label}</span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
