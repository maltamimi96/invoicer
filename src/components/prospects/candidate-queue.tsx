"use client";

/**
 * The review queue — the one place a found business becomes a prospect.
 *
 * Shared by a single hunt's page and the all-hunts queue, so approving works
 * identically in both. Every row carries the agent's reasoning: if the picks
 * are wrong, the fix is the hunt's criteria, and you can only see that if the
 * reasoning is on screen next to the business.
 */

import { useState } from "react";
import { toast } from "sonner";
import { useMutation } from "@/components/layout/use-mutation";
import { Button } from "@/components/ui/button";
import { Target, MapPin, Globe, Phone, Star, Check } from "@/components/ui/icons";
import { addCandidates, dismissCandidates } from "@/lib/actions/prospecting";
import type { ProspectCandidate } from "@/types/database";

interface Props {
  candidates: ProspectCandidate[];
  /** Shown when the queue is empty. */
  emptyMessage: string;
  /** Optional per-row label, e.g. which hunt found it. */
  labelFor?: (c: ProspectCandidate) => string | null;
}

export function CandidateQueue({ candidates, emptyMessage, labelFor }: Props) {
  const { run, pending } = useMutation();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function handleAdd(ids: string[]) {
    if (!ids.length) return;
    void run(async () => {
      const { added } = await addCandidates(ids);
      setSelected(new Set());
      if (!added) toast.info("Those are already in your prospect list");
    }, { busy: "Adding to prospects…", success: "Added to prospects", error: "Couldn't add" });
  }

  function handleDismiss(ids: string[]) {
    if (!ids.length) return;
    void run(async () => {
      await dismissCandidates(ids);
      setSelected(new Set());
    }, { busy: "Dismissing…", success: "Dismissed", error: "Couldn't dismiss" });
  }

  if (candidates.length === 0) {
    return (
      <div className="ch-empty">
        <Target className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
        <p className="font-medium">Nothing waiting</p>
        <p className="text-sm text-muted-foreground mt-1">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <>
      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
          <Button variant="outline" size="sm" disabled={pending}
            onClick={() => handleDismiss([...selected])}>
            Dismiss {selected.size}
          </Button>
          <Button size="sm" disabled={pending} onClick={() => handleAdd([...selected])}>
            <Check className="w-4 h-4 mr-1.5" /> Add {selected.size} to prospects
          </Button>
        </div>
      )}

      <div className="space-y-2">
        {candidates.map((c) => {
          const label = labelFor?.(c) ?? null;
          return (
            <div key={c.id}
              className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={selected.has(c.id)}
                onChange={() => toggle(c.id)}
                aria-label={`Select ${c.name}`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium break-words">{c.name}</p>
                  {c.score != null && <span className="ch-pill accepted">{c.score}% fit</span>}
                  {c.category && <span className="text-xs text-muted-foreground">{c.category}</span>}
                  {label && <span className="text-xs text-muted-foreground">· {label}</span>}
                </div>

                {c.reasoning && (
                  <p className="mt-1 text-sm text-muted-foreground break-words">{c.reasoning}</p>
                )}

                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {c.address && (
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3 shrink-0" /> {c.address}
                    </span>
                  )}
                  {c.phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="w-3 h-3 shrink-0" /> {c.phone}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Globe className="w-3 h-3 shrink-0" />
                    {c.website
                      ? <a href={c.website} target="_blank" rel="noopener noreferrer"
                          className="underline break-all">{c.website}</a>
                      : "No website"}
                  </span>
                  {c.rating != null && (
                    <span className="flex items-center gap-1">
                      <Star className="w-3 h-3 shrink-0" /> {c.rating} ({c.review_count ?? 0})
                    </span>
                  )}
                </div>
              </div>

              <div className="flex shrink-0 gap-2">
                <Button variant="outline" size="sm" disabled={pending}
                  onClick={() => handleDismiss([c.id])}>Skip</Button>
                <Button size="sm" disabled={pending} onClick={() => handleAdd([c.id])}>Add</Button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
