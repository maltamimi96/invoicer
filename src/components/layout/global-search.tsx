"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "@/components/ui/icons";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { filterNav, navSections } from "./nav-config";

/**
 * The MYOB-style search pill in the top bar. Opens a command palette (also on
 * ⌘K / Ctrl-K) that jumps to any nav destination the current user can see.
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
  const [open, setOpen] = useState(false);
  const sections = filterNav(navSections, { workerView, features });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex h-9 w-full items-center gap-2 rounded-full bg-white/15 px-3.5 text-sm text-primary-foreground/80 transition-colors hover:bg-white/25"
      >
        <Search className="h-4 w-4 opacity-80" />
        <span className="truncate">Search…</span>
        <kbd className="ml-auto hidden rounded border border-white/25 px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground/70 sm:inline">
          ⌘K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Jump to…" />
        <CommandList>
          <CommandEmpty>No matches.</CommandEmpty>
          {sections.map((group) => (
            <CommandGroup key={group.section} heading={group.section}>
              {group.items.map((item) => {
                const label = vocab?.[item.href] ?? item.label;
                return (
                  <CommandItem key={item.href} value={`${label} ${item.href}`} onSelect={() => go(item.href)}>
                    <item.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                    {label}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  );
}
