"use client";

/**
 * Building a hunt.
 *
 * The shape of this form is the feature. v1 was a textarea of comma-separated
 * terms and a single radius, which made the two things that actually decide
 * your results — what you search for and who counts — feel like afterthoughts.
 *
 * Here each search term is its own chip you add and remove, the area is either
 * a radius or an explicit list of suburbs, the target is a number you set, and
 * named requirements are rows you add one at a time. Everything the agent will
 * be judged on is visible at once.
 */

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, X, Trash2, MapPin, Search, Target } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import type {
  ProspectHunt, ProspectHuntParam, ProspectHuntAreaMode, ProspectHuntFilters,
} from "@/types/database";

export interface HuntDraft {
  name: string;
  queries: string[];
  criteria: string;
  target_count: number;
  area_mode: ProspectHuntAreaMode;
  area: string;
  radius_km: number;
  suburb_labels: string[];
  custom_params: ProspectHuntParam[];
  filters: ProspectHuntFilters;
}

export function emptyDraft(): HuntDraft {
  return {
    name: "", queries: [], criteria: "", target_count: 20,
    area_mode: "radius", area: "", radius_km: 25, suburb_labels: [],
    custom_params: [], filters: { require_phone: true },
  };
}

export function draftFrom(h: ProspectHunt): HuntDraft {
  return {
    name: h.name,
    queries: h.queries ?? [],
    criteria: h.criteria,
    target_count: h.target_count ?? 20,
    area_mode: h.area_mode ?? "radius",
    area: h.centre_label ?? "",
    radius_km: Math.round((h.radius_m ?? 25000) / 1000),
    suburb_labels: (h.suburbs ?? []).map((s) => s.label),
    custom_params: h.custom_params ?? [],
    filters: h.filters ?? {},
  };
}

/**
 * A list you build one item at a time.
 *
 * Comma-separated text in a box looks simpler but hides the model: you can't
 * see that "roof repair, roofing" is two searches and therefore twice the
 * cost. Chips make the count obvious, which matters when each one is billed.
 */
function ChipList({ label, hint, items, placeholder, onChange }: {
  label: string;
  hint?: string;
  items: string[];
  placeholder: string;
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  function add() {
    const value = draft.trim();
    if (!value) return;
    if (items.some((i) => i.toLowerCase() === value.toLowerCase())) {
      toast.info("Already on the list");
      setDraft("");
      return;
    }
    onChange([...items, value]);
    setDraft("");
  }

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <Label>{label}</Label>
        <span className="text-xs text-muted-foreground">
          {items.length} {items.length === 1 ? "item" : "items"}
        </span>
      </div>

      <div className="mt-1 flex gap-2">
        <Input
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          // Enter adds, and does NOT submit the dialog — losing a half-typed
          // list to an accidental save is the obvious way to make this annoying.
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
        />
        <Button type="button" variant="outline" onClick={add} aria-label={`Add ${label}`}>
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}

      {items.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {items.map((item) => (
            <span key={item}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 py-1 pl-3 pr-1 text-sm">
              <span className="break-all">{item}</span>
              <button
                type="button"
                onClick={() => onChange(items.filter((i) => i !== item))}
                className="rounded-full p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
                aria-label={`Remove ${item}`}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Named requirements — the thing that makes a rejection explain itself. */
function ParamEditor({ params, onChange }: {
  params: ProspectHuntParam[];
  onChange: (next: ProspectHuntParam[]) => void;
}) {
  function add() {
    if (params.length >= 12) { toast.info("Twelve requirements is plenty"); return; }
    onChange([...params, {
      id: `p${Date.now().toString(36)}`, label: "", requirement: "", required: false,
    }]);
  }

  function patch(id: string, fields: Partial<ProspectHuntParam>) {
    onChange(params.map((p) => (p.id === id ? { ...p, ...fields } : p)));
  }

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <Label>Requirements</Label>
        <Button type="button" size="sm" variant="outline" onClick={add}>
          <Plus className="w-4 h-4 mr-1" /> Add
        </Button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Each one is checked separately, so a rejection tells you which requirement failed
        instead of just &ldquo;not a fit&rdquo;.
      </p>

      {params.length === 0 ? (
        <p className="mt-2 rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
          None yet — the overall criteria above will be used on its own.
        </p>
      ) : (
        <div className="mt-2 space-y-2">
          {params.map((p) => (
            <div key={p.id} className="rounded-lg border border-border p-3">
              <div className="flex gap-2">
                <Input
                  className="h-9"
                  value={p.label}
                  placeholder="Owner-operator"
                  onChange={(e) => patch(p.id, { label: e.target.value })}
                  aria-label="Requirement name"
                />
                <Button type="button" variant="outline" size="sm"
                  onClick={() => onChange(params.filter((x) => x.id !== p.id))}
                  aria-label="Remove requirement">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
              <Textarea
                className="mt-2"
                rows={2}
                value={p.requirement}
                placeholder="Looks like a sole trader or a small crew — not a franchise or a national chain."
                onChange={(e) => patch(p.id, { requirement: e.target.value })}
                aria-label="What to check"
              />
              <label className="mt-2 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={p.required}
                  onChange={(e) => patch(p.id, { required: e.target.checked })}
                />
                Must pass — failing this disqualifies the business outright
              </label>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function HuntBuilder({ draft, onChange }: {
  draft: HuntDraft;
  onChange: (next: HuntDraft) => void;
}) {
  const set = <K extends keyof HuntDraft>(key: K, value: HuntDraft[K]) =>
    onChange({ ...draft, [key]: value });

  return (
    <div className="space-y-5">
      <div>
        <Label htmlFor="hunt-name">Name</Label>
        <Input id="hunt-name" value={draft.name} placeholder="Western Sydney tradies"
          onChange={(e) => set("name", e.target.value)} />
      </div>

      <ChipList
        label="Search terms"
        hint="Each term is a separate Google search, so each one adds to the cost."
        items={draft.queries}
        placeholder="roofing contractor"
        onChange={(next) => set("queries", next)}
      />

      {/* ── How many ─────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <Label htmlFor="hunt-target" className="flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5" /> How many do you want?
          </Label>
          <span className="text-sm font-medium tabular-nums">{draft.target_count}</span>
        </div>
        <input
          id="hunt-target"
          type="range"
          min={1}
          max={100}
          value={draft.target_count}
          onChange={(e) => set("target_count", Number(e.target.value))}
          className="mt-2 w-full accent-primary"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          The run stops once it has this many, so you only pay to judge what you asked for.
        </p>
      </div>

      {/* ── Where ────────────────────────────────────────────────────── */}
      <div>
        <Label className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> Where</Label>
        <div className="mt-1 inline-flex rounded-md border border-border p-0.5">
          {(["radius", "suburbs"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => set("area_mode", mode)}
              className={cn(
                "rounded px-3 py-1 text-sm transition",
                draft.area_mode === mode
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {mode === "radius" ? "Radius" : "Suburb list"}
            </button>
          ))}
        </div>

        {draft.area_mode === "radius" ? (
          <div className="mt-2 grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="hunt-area" className="text-xs">Centre</Label>
              <Input id="hunt-area" value={draft.area} placeholder="Parramatta NSW"
                onChange={(e) => set("area", e.target.value)} />
            </div>
            <div>
              <Label htmlFor="hunt-radius" className="text-xs">Radius (km)</Label>
              <Input id="hunt-radius" type="number" min={1} max={50} value={draft.radius_km}
                onChange={(e) => set("radius_km", Number(e.target.value))} />
            </div>
          </div>
        ) : (
          <div className="mt-2">
            <ChipList
              label="Suburbs"
              hint="Each is searched in its own right — a service area is usually a list of suburbs, not a circle."
              items={draft.suburb_labels}
              placeholder="Parramatta NSW"
              onChange={(next) => set("suburb_labels", next)}
            />
          </div>
        )}
      </div>

      {/* ── Who counts ───────────────────────────────────────────────── */}
      <div>
        <Label htmlFor="hunt-criteria" className="flex items-center gap-1.5">
          <Search className="w-3.5 h-3.5" /> What makes them a prospect?
        </Label>
        <Textarea id="hunt-criteria" rows={3} value={draft.criteria}
          placeholder="Service-based tradies who look like owner-operators or small crews — not franchises or national chains."
          onChange={(e) => set("criteria", e.target.value)} />
        <p className="mt-1 text-xs text-muted-foreground">
          Plain English. An agent reads every listing and judges it against this.
        </p>
      </div>

      <ParamEditor
        params={draft.custom_params}
        onChange={(next) => set("custom_params", next)}
      />

      {/* ── Hard filters ─────────────────────────────────────────────── */}
      <div className="space-y-2 rounded-lg border border-border p-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Hard filters — applied before anything is judged, so they cost nothing
        </p>
        <label className="flex flex-wrap items-center gap-2 text-sm">
          <input type="checkbox" checked={Boolean(draft.filters.no_website)}
            onChange={(e) => set("filters", { ...draft.filters, no_website: e.target.checked || undefined })} />
          Only businesses with no real website
          <span className="text-xs text-muted-foreground">(a Facebook page doesn&apos;t count)</span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={Boolean(draft.filters.require_phone)}
            onChange={(e) => set("filters", { ...draft.filters, require_phone: e.target.checked || undefined })} />
          Must have a phone number
        </label>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="flex items-center gap-2">
            Minimum rating
            <Input
              className="h-8 w-20" type="number" min={0} max={5} step="0.1"
              value={draft.filters.min_rating ?? ""}
              onChange={(e) => set("filters", {
                ...draft.filters,
                min_rating: e.target.value === "" ? undefined : Number(e.target.value),
              })}
            />
          </label>
          <label className="flex items-center gap-2">
            Max reviews
            <Input
              className="h-8 w-24" type="number" min={0}
              value={draft.filters.max_reviews ?? ""}
              onChange={(e) => set("filters", {
                ...draft.filters,
                max_reviews: e.target.value === "" ? undefined : Number(e.target.value),
              })}
            />
          </label>
        </div>
      </div>
    </div>
  );
}

/** Shared validation — the same rules whether you're creating or editing. */
export function validateDraft(draft: HuntDraft): string | null {
  if (!draft.name.trim()) return "Give the hunt a name";
  if (!draft.queries.length) return "Add at least one search term";
  if (!draft.criteria.trim()) return "Describe what makes a business a prospect";
  if (draft.area_mode === "radius" && !draft.area.trim()) return "Set an area to search";
  if (draft.area_mode === "suburbs" && !draft.suburb_labels.length) return "Add at least one suburb";
  if (draft.custom_params.some((p) => !p.label.trim() || !p.requirement.trim())) {
    return "Every requirement needs a name and something to check";
  }
  return null;
}
