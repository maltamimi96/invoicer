"use client";

/**
 * The hunt list — saved searches, and the form that creates one.
 *
 * The form is mostly one big free-text box, and that's deliberate: `criteria`
 * is the whole feature. Everything else (terms, area, radius) narrows WHERE to
 * look; the criteria decide WHO counts, and they're handed to the verifying
 * agent word for word.
 */

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useMutation } from "@/components/layout/use-mutation";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Target, Plus, MapPin, Search, Globe, Star } from "@/components/ui/icons";
import { createHunt, setProspectingBudget } from "@/lib/actions/prospecting";
import type { SpendStatus } from "@/lib/prospecting/budget";
import type { ProspectHunt } from "@/types/database";

interface Props {
  hunts: ProspectHunt[];
  pendingReview: number;
  budget: SpendStatus;
  /** A Places key is available — the business's own, or Kirei's. */
  canHunt: boolean;
}

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/**
 * Spend against the cap.
 *
 * Shown only when hunts run on Kirei's shared key — that's the only case where
 * a cap is doing anything. A business paying Google on its own key is already
 * capped by its own Cloud quota, and showing them a Kirei budget would imply
 * we're rationing money that isn't ours to ration.
 */
function BudgetCard({ budget }: { budget: SpendStatus }) {
  const { run, pending } = useMutation();
  const [editing, setEditing] = useState(false);
  const [dollars, setDollars] = useState((budget.budgetCents / 100).toFixed(2));

  if (!budget.usingPlatformKey) return null;

  const unlimited = budget.budgetCents === 0;
  const pct = unlimited ? 0 : Math.min(100, (budget.spentCents / budget.budgetCents) * 100);

  function save() {
    const cents = Math.round(Number(dollars) * 100);
    if (!Number.isFinite(cents) || cents < 0) { toast.error("Enter an amount"); return; }
    void run(() => setProspectingBudget(cents), {
      busy: "Saving budget…", success: "Budget updated", error: "Couldn't save",
    }).then(() => setEditing(false));
  }

  return (
    <div className="mb-4 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium">
          {money(budget.spentCents)} spent this month
          {!unlimited && <span className="text-muted-foreground"> of {money(budget.budgetCents)}</span>}
        </p>
        {editing ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">$</span>
            <Input className="h-8 w-24" type="number" min={0} step="0.5"
              value={dollars} onChange={(e) => setDollars(e.target.value)} />
            <Button size="sm" onClick={save} disabled={pending}>Save</Button>
            <Button size="sm" variant="outline" onClick={() => setEditing(false)} disabled={pending}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            {unlimited ? "Set a cap" : "Change cap"}
          </Button>
        )}
      </div>

      {!unlimited && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={pct >= 100 ? "h-full bg-destructive" : "h-full bg-primary"}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      <p className="mt-2 text-xs text-muted-foreground">
        Hunts run on Kirei&apos;s Google Places key, so searching and verifying are metered.
        {unlimited
          ? " No cap set — hunts will keep running."
          : " Hunts stop once the month's spend reaches the cap."}{" "}
        Using your own key instead (<Link href="/outreach/settings" className="underline">Outreach settings</Link>)
        removes the cap and bills Google directly.
      </p>
    </div>
  );
}

export function HuntsView({ hunts, pendingReview, budget, canHunt }: Props) {
  const { run, pending } = useMutation();
  const [open, setOpen] = useState(false);

  const [name, setName] = useState("");
  const [queries, setQueries] = useState("");
  const [criteria, setCriteria] = useState("");
  const [area, setArea] = useState("");
  const [radius, setRadius] = useState("25");
  const [noWebsite, setNoWebsite] = useState(false);
  const [requirePhone, setRequirePhone] = useState(true);

  function handleCreate() {
    const terms = queries.split(/[,\n]/).map((q) => q.trim()).filter(Boolean);
    if (!name.trim()) { toast.error("Give the hunt a name"); return; }
    if (!terms.length) { toast.error("Add at least one search term"); return; }
    if (!criteria.trim()) { toast.error("Describe what makes a business a prospect"); return; }

    void run(async () => {
      await createHunt({
        name, queries: terms, criteria, area,
        radius_km: Number(radius) || 25,
        filters: { no_website: noWebsite || undefined, require_phone: requirePhone || undefined },
      });
      setOpen(false);
      setName(""); setQueries(""); setCriteria(""); setArea("");
    }, { busy: "Creating hunt…", success: "Hunt created", error: "Couldn't create the hunt" });
  }

  return (
    <>
      <PageHeader
        title="Prospecting"
        subtitle="Describe who you want to find. The agent searches your area, checks each business, and queues the matches for you."
        actions={
          <Button onClick={() => setOpen(true)} disabled={pending}>
            <Plus className="w-4 h-4 mr-1.5" /> New hunt
          </Button>
        }
      />

      {!canHunt && (
        <div className="ch-empty mb-4 border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <p className="font-medium">No Google Places key is available, so hunts can&apos;t search.</p>
          <p className="text-sm mt-1">
            Add your own under <Link href="/outreach/settings" className="underline">Outreach settings</Link>,
            or ask an admin to configure Kirei&apos;s.
          </p>
        </div>
      )}

      {canHunt && <BudgetCard budget={budget} />}

      {pendingReview > 0 && (
        <Link
          href="/prospects/review"
          className="ch-quick-action mb-4 flex items-center justify-between rounded-xl border border-border bg-card p-4 hover:bg-muted/50"
        >
          <span className="flex items-center gap-2 font-medium">
            <Target className="w-4 h-4 text-primary" />
            {pendingReview} {pendingReview === 1 ? "business is" : "businesses are"} waiting for review
          </span>
          <span className="text-sm text-muted-foreground">Review →</span>
        </Link>
      )}

      {hunts.length === 0 ? (
        <div className="ch-empty">
          <Target className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
          <p className="font-medium">No hunts yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            A hunt is a saved search: what to look for, where, and what makes a business worth your time.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {hunts.map((h) => (
            <Link
              key={h.id}
              href={`/prospects/hunts/${h.id}`}
              className="rounded-xl border border-border bg-card p-4 shadow-sm transition hover:border-primary/40"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium break-words">{h.name}</p>
                {!h.active && <span className="ch-pill draft">Paused</span>}
              </div>
              <p className="mt-1 text-sm text-muted-foreground break-words line-clamp-2">{h.criteria}</p>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Search className="w-3 h-3" /> {h.queries.length} {h.queries.length === 1 ? "term" : "terms"}
                </span>
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {h.centre_label ?? "No area set"} · {Math.round(h.radius_m / 1000)}km
                </span>
                {h.filters?.no_website && (
                  <span className="flex items-center gap-1"><Globe className="w-3 h-3" /> No website</span>
                )}
                {h.filters?.min_rating != null && (
                  <span className="flex items-center gap-1"><Star className="w-3 h-3" /> {h.filters.min_rating}+</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New hunt</DialogTitle>
            <DialogDescription>
              Search terms find businesses. The criteria decide which ones are worth your time.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="hunt-name">Name</Label>
              <Input id="hunt-name" value={name} onChange={(e) => setName(e.target.value)}
                placeholder="Western Sydney tradies" />
            </div>

            <div>
              <Label htmlFor="hunt-queries">Search terms</Label>
              <Textarea id="hunt-queries" rows={2} value={queries} onChange={(e) => setQueries(e.target.value)}
                placeholder="plumber, electrician, roofing contractor" />
              <p className="mt-1 text-xs text-muted-foreground">
                One per line or comma-separated. These go to Google as-is.
              </p>
            </div>

            <div>
              <Label htmlFor="hunt-criteria">What makes them a prospect?</Label>
              <Textarea id="hunt-criteria" rows={3} value={criteria} onChange={(e) => setCriteria(e.target.value)}
                placeholder="Service-based tradies who look like owner-operators or small crews — not franchises or national chains." />
              <p className="mt-1 text-xs text-muted-foreground">
                Plain English. An agent reads every listing and judges it against this.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="hunt-area">Area</Label>
                <Input id="hunt-area" value={area} onChange={(e) => setArea(e.target.value)}
                  placeholder="Parramatta NSW" />
              </div>
              <div>
                <Label htmlFor="hunt-radius">Radius (km)</Label>
                <Input id="hunt-radius" type="number" min={1} max={50} value={radius}
                  onChange={(e) => setRadius(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2 rounded-lg border border-border p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Hard filters — applied before anything is judged
              </p>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={noWebsite} onChange={(e) => setNoWebsite(e.target.checked)} />
                Only businesses with no real website
                <span className="text-xs text-muted-foreground">(a Facebook page doesn&apos;t count)</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={requirePhone} onChange={(e) => setRequirePhone(e.target.checked)} />
                Must have a phone number
              </label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
            <Button onClick={handleCreate} disabled={pending}>Create hunt</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
