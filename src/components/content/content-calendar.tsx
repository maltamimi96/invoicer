"use client";

/**
 * The content calendar — a month of scheduled variations.
 *
 * Reads content_variations.scheduled_at, which is the same column a future
 * auto-poster will read. Until the platform connectors clear review, "Mark
 * posted" is the publish path and this is the plan you work from.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Check, X, ExternalLink } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { PLATFORMS } from "@/lib/content/pipeline";
import {
  markVariationPosted, unmarkVariationPosted, scheduleVariation,
  type CalendarEntry,
} from "@/lib/actions/content-campaigns";

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const platformLabel = (id: string) => PLATFORMS.find((p) => p.id === id)?.label ?? id;

/** Local Y-M-D. Not toISOString — that converts to UTC and can land the card on
 *  the wrong day for anyone east or west of Greenwich. */
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** The Monday-first grid covering a month, including the neighbouring days
 *  that fill the first and last weeks. */
function monthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // JS weeks start Sunday; ours don't.
  const start = new Date(year, month, 1 - offset);
  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    cells.push(d);
  }
  return cells;
}

export function ContentCalendar({
  entries,
  year,
  month,
  onMonth,
}: {
  entries: CalendarEntry[];
  year: number;
  month: number;
  onMonth: (year: number, month: number) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState<CalendarEntry | null>(null);
  const [url, setUrl] = useState("");
  const [when, setWhen] = useState("");

  const byDay = new Map<string, CalendarEntry[]>();
  for (const e of entries) {
    if (!e.scheduled_at) continue;
    const key = ymd(new Date(e.scheduled_at));
    byDay.set(key, [...(byDay.get(key) ?? []), e]);
  }

  const cells = monthGrid(year, month);
  const today = ymd(new Date());
  const label = new Date(year, month, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  const shift = (by: number) => {
    const d = new Date(year, month + by, 1);
    onMonth(d.getFullYear(), d.getMonth());
  };

  const openCard = (e: CalendarEntry) => {
    setOpen(e);
    setUrl(e.external_url ?? "");
    // datetime-local wants local time with no zone — slice the ISO after
    // shifting it out of UTC, or the picker shows the wrong hour.
    if (e.scheduled_at) {
      const d = new Date(e.scheduled_at);
      const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
      setWhen(local.toISOString().slice(0, 16));
    } else {
      setWhen("");
    }
  };

  const run = (fn: () => Promise<void>, ok: string) =>
    start(async () => {
      try {
        await fn();
        toast.success(ok);
        setOpen(null);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "That didn't work.");
      }
    });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => shift(-1)} className="h-7 w-7 p-0">
            <ChevronLeft className="w-3.5 h-3.5" />
          </Button>
          <span className="text-sm font-medium px-2 min-w-[9rem] text-center">{label}</span>
          <Button variant="outline" size="sm" onClick={() => shift(1)} className="h-7 w-7 p-0">
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {entries.length} scheduled this month
        </p>
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="grid grid-cols-7 border-b bg-muted/40">
          {DOW.map((d) => (
            <div key={d} className="px-2 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground text-center">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((d) => {
            const key = ymd(d);
            const items = byDay.get(key) ?? [];
            const outside = d.getMonth() !== month;
            return (
              <div
                key={key}
                className={`min-h-[6rem] border-b border-r p-1 space-y-1 ${outside ? "bg-muted/20" : ""}`}
              >
                <div
                  className={`text-[10px] px-1 ${
                    key === today
                      ? "font-bold text-primary"
                      : outside
                        ? "text-muted-foreground/50"
                        : "text-muted-foreground"
                  }`}
                >
                  {d.getDate()}
                </div>
                {items.map((e) => (
                  <button
                    key={e.id}
                    onClick={() => openCard(e)}
                    className={`w-full text-left rounded px-1.5 py-1 text-[10px] leading-tight transition-colors ${
                      e.status === "posted"
                        ? "bg-green-500/10 text-green-700 dark:text-green-400 line-through"
                        : e.status === "approved"
                          ? "bg-primary/10 text-primary hover:bg-primary/20"
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                    title={e.content_pieces?.topic ?? ""}
                  >
                    <span className="block truncate font-medium">{platformLabel(e.platform)}</span>
                    <span className="block truncate opacity-80">{e.hook ?? e.angle}</span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Only approved variations should go out — grey cards are still drafts. Auto-posting arrives
        with the platform connectors; until then, post it and mark it here.
      </p>

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base">
              {open ? platformLabel(open.platform) : ""} — {open?.content_pieces?.topic}
            </DialogTitle>
          </DialogHeader>

          {open && (
            <div className="space-y-3 text-sm">
              <p className="text-[11px] text-muted-foreground">{open.angle}</p>
              {open.hook && <p className="font-medium break-words">“{open.hook}”</p>}
              {open.body && (
                <p className="text-xs whitespace-pre-wrap break-words max-h-48 overflow-y-auto rounded-md border bg-muted/40 p-2">
                  {open.body}
                </p>
              )}

              <div className="space-y-1">
                <label className="text-xs font-medium">Scheduled for</label>
                <Input
                  type="datetime-local"
                  value={when}
                  onChange={(e) => setWhen(e.target.value)}
                />
              </div>

              {open.status === "posted" ? (
                <div className="space-y-1">
                  <p className="text-xs text-green-600 dark:text-green-400">
                    Posted {open.posted_at ? new Date(open.posted_at).toLocaleString() : ""}.
                  </p>
                  {open.external_url && (
                    <a
                      href={open.external_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary underline inline-flex items-center gap-1"
                    >
                      View the post <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              ) : (
                <div className="space-y-1">
                  <label className="text-xs font-medium">Link to the post (optional)</label>
                  <Input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://instagram.com/p/…"
                  />
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              variant="outline"
              size="sm"
              disabled={pending || !open}
              onClick={() =>
                open &&
                run(
                  () => scheduleVariation(open.id, when ? new Date(when).toISOString() : null),
                  when ? "Rescheduled." : "Taken off the calendar."
                )
              }
            >
              {when ? "Save time" : "Unschedule"}
            </Button>

            {open?.status === "posted" ? (
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => run(() => unmarkVariationPosted(open.id), "Back to approved.")}
                className="gap-1.5"
              >
                <X className="w-3.5 h-3.5" /> Not posted after all
              </Button>
            ) : (
              <Button
                size="sm"
                disabled={pending || !open}
                onClick={() => open && run(() => markVariationPosted(open.id, url), "Marked as posted.")}
                className="gap-1.5"
              >
                <Check className="w-3.5 h-3.5" /> Mark posted
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
