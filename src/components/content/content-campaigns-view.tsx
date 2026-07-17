"use client";

/**
 * Campaigns — a theme, and the pieces it fans out into.
 *
 * Planning is deterministic: pick the topics, pick the cadence, and each topic
 * becomes a piece dated by the cadence. The creative calls were already made by
 * the scout and the angle strategist; spacing them on a calendar is arithmetic.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, Sparkles, Loader2 } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { CADENCES } from "@/lib/content/schedule";
import { PLATFORMS, type ContentKind } from "@/lib/content/pipeline";
import {
  createContentCampaign, deleteContentCampaign, planContentCampaign,
} from "@/lib/actions/content-campaigns";
import type { ContentBrand, ContentCampaign, ContentTopic } from "@/types/database";

const cadenceLabel = (id: string | null) =>
  CADENCES.find((c) => c.id === id)?.label ?? "No cadence";

export function ContentCampaignsView({
  brand,
  campaigns,
  topics,
}: {
  brand: ContentBrand;
  campaigns: ContentCampaign[];
  topics: ContentTopic[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [creating, setCreating] = useState(false);
  const [planning, setPlanning] = useState<ContentCampaign | null>(null);

  const [form, setForm] = useState({ name: "", theme: "", goal: "", starts_on: "", cadence: "weekly" });
  const [picked, setPicked] = useState<string[]>([]);
  const [kind, setKind] = useState<ContentKind>("script");
  const [platforms, setPlatforms] = useState<string[]>(["instagram", "tiktok"]);

  const create = () =>
    start(async () => {
      try {
        await createContentCampaign(brand.id, form);
        toast.success("Campaign created. Plan it to queue the pieces.");
        setCreating(false);
        setForm({ name: "", theme: "", goal: "", starts_on: "", cadence: "weekly" });
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't create that.");
      }
    });

  const plan = () =>
    start(async () => {
      if (!planning) return;
      try {
        const { queued } = await planContentCampaign({
          campaignId: planning.id,
          topicIds: picked,
          kind,
          platforms,
          angleCount: 3,
        });
        toast.success(`${queued} piece${queued === 1 ? "" : "s"} queued. Watch the calendar fill in.`);
        setPlanning(null);
        setPicked([]);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't plan that.");
      }
    });

  const remove = (c: ContentCampaign) =>
    start(async () => {
      try {
        await deleteContentCampaign(c.id);
        toast.success("Campaign deleted. Its pieces are still there.");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't delete that.");
      }
    });

  // Only topics not already spoken for — 'queued' is the scout's default.
  const available = topics.filter((t) => t.status === "queued");

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          A campaign turns a run of topics into pieces spread over a cadence, all dated on the
          calendar.
        </p>
        <Button size="sm" onClick={() => setCreating(true)} className="gap-1.5 shrink-0">
          <Plus className="w-3.5 h-3.5" /> New campaign
        </Button>
      </div>

      {campaigns.length === 0 ? (
        <div className="ch-empty">
          <p>No campaigns yet.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Generate one-off pieces from the Content tab, or group a run of them here.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {campaigns.map((c) => (
            <div key={c.id} className="rounded-xl border bg-card p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium break-words">{c.name}</p>
                  {c.theme && <p className="text-xs text-muted-foreground mt-0.5 break-words">{c.theme}</p>}
                  <div className="flex flex-wrap gap-1.5 mt-1.5 text-[10px] text-muted-foreground">
                    <span className="rounded-full border px-1.5 py-0.5">{cadenceLabel(c.cadence)}</span>
                    {c.starts_on && (
                      <span className="rounded-full border px-1.5 py-0.5">
                        from {new Date(`${c.starts_on}T12:00:00Z`).toLocaleDateString()}
                      </span>
                    )}
                    <span className={`ch-pill ${c.status === "active" ? "active" : "draft"}`}>{c.status}</span>
                  </div>
                  {c.goal && <p className="text-[11px] text-muted-foreground mt-1.5 break-words">Goal: {c.goal}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1"
                    disabled={pending}
                    onClick={() => { setPlanning(c); setPicked([]); }}
                  >
                    <Sparkles className="w-3 h-3" /> Plan
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                    disabled={pending}
                    onClick={() => remove(c)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create */}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader><DialogTitle className="text-base">New campaign</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium">Name</label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Storm season 2026"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Theme</label>
              <Input
                value={form.theme}
                onChange={(e) => setForm({ ...form, theme: e.target.value })}
                placeholder="What to do before the first big storm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Goal</label>
              <Input
                value={form.goal}
                onChange={(e) => setForm({ ...form, goal: e.target.value })}
                placeholder="Book inspections before October"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs font-medium">Starts on</label>
                <Input
                  type="date"
                  value={form.starts_on}
                  onChange={(e) => setForm({ ...form, starts_on: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Cadence</label>
                <select
                  value={form.cadence}
                  onChange={(e) => setForm({ ...form, cadence: e.target.value })}
                  className="w-full h-9 text-sm border rounded-md px-2 bg-background"
                >
                  {CADENCES.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={create} disabled={pending || !form.name.trim()}>
              {pending ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Plan */}
      <Dialog open={!!planning} onOpenChange={(o) => !o && setPlanning(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base">Plan “{planning?.name}”</DialogTitle>
          </DialogHeader>

          {!planning?.starts_on ? (
            <p className="text-sm text-muted-foreground">
              This campaign has no start date, so there's nothing to space the pieces across. Add
              one first.
            </p>
          ) : available.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No unused topics. Run the scout on the Topics tab and come back.
            </p>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Each topic becomes one piece, {cadenceLabel(planning.cadence).toLowerCase()} from{" "}
                {new Date(`${planning.starts_on}T12:00:00Z`).toLocaleDateString()}. Highest priority
                goes out first.
              </p>

              <div className="space-y-1 max-h-56 overflow-y-auto rounded-md border p-2">
                {available.map((t) => {
                  const on = picked.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      onClick={() =>
                        setPicked((p) => (on ? p.filter((x) => x !== t.id) : [...p, t.id]))
                      }
                      className={`w-full text-left rounded-md px-2 py-1.5 text-xs transition-colors ${
                        on ? "bg-primary/10 text-primary" : "hover:bg-muted"
                      }`}
                    >
                      <span className="break-words">{t.title}</span>
                      <span className="text-[10px] text-muted-foreground ml-1.5">P{t.priority}</span>
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap gap-1.5">
                {(["script", "post", "hooks"] as ContentKind[]).map((k) => (
                  <button
                    key={k}
                    onClick={() => setKind(k)}
                    className={`text-xs rounded-md border px-2 py-1 ${
                      kind === k ? "bg-primary/10 border-primary/40 text-primary" : "text-muted-foreground"
                    }`}
                  >
                    {k}
                  </button>
                ))}
              </div>

              {kind !== "hooks" && (
                <div className="flex flex-wrap gap-1.5">
                  {PLATFORMS.map((p) => {
                    const on = platforms.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        onClick={() =>
                          setPlatforms((prev) => (on ? prev.filter((x) => x !== p.id) : [...prev, p.id]))
                        }
                        className={`text-xs rounded-md border px-2 py-1 ${
                          on ? "bg-primary/10 border-primary/40 text-primary" : "text-muted-foreground"
                        }`}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              )}

              <p className="text-[11px] text-muted-foreground">
                {picked.length} topic{picked.length === 1 ? "" : "s"} ·{" "}
                {kind === "hooks" ? picked.length * 3 : picked.length * 3 * platforms.length} variations
                in total. Each one costs a model call.
              </p>
            </div>
          )}

          <DialogFooter>
            <Button onClick={plan} disabled={pending || picked.length === 0} className="gap-1.5">
              {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {pending ? "Queueing…" : "Queue the campaign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
