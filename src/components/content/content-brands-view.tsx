"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTrackedRefresh } from "@/components/layout/use-mutation";
import Link from "next/link";
import { toast } from "sonner";
import { Megaphone, Plus, Trash2 } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/layout/page-header";
import { createContentBrand, deleteContentBrand } from "@/lib/actions/content";
import type { ContentBrand } from "@/types/database";

/**
 * Brand list + create.
 *
 * The create form asks for the things the pipeline genuinely needs — trade,
 * services, audience, voice, proof points, banned phrases. That's not
 * onboarding ceremony: a topic scout with no trade researches "business" and
 * returns nothing a roofer could post.
 */
export function ContentBrandsView({
  brands,
  customers,
}: {
  brands: ContentBrand[];
  customers: { id: string; name: string }[];
}) {
  const router = useRouter();
  // The scrim has to outlast the refresh: a local `finally { setBusy(false) }`
  // fires when refresh() is CALLED, not when the server output arrives.
  const { refresh } = useTrackedRefresh();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  const [form, setForm] = useState({
    name: "",
    customer_id: "",
    industry: "",
    services: "",
    service_area: "",
    audience: "",
    voice: "",
    banned_phrases: "",
  });

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = () => {
    if (!form.name.trim()) {
      toast.error("The brand needs a name.");
      return;
    }
    start(async () => {
      try {
        const brand = await createContentBrand({
          name: form.name,
          customer_id: form.customer_id || null,
          industry: form.industry,
          services: form.services,
          service_area: form.service_area,
          audience: form.audience,
          voice: form.voice,
          banned_phrases: form.banned_phrases,
        });
        toast.success(`${brand.name} added.`);
        setOpen(false);
        router.push(`/content/${brand.id}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't create that brand.");
      }
    });
  };

  const remove = (brand: ContentBrand) => {
    start(async () => {
      try {
        await deleteContentBrand(brand.id);
        toast.success(`${brand.name} removed.`);
        refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't remove that brand.");
      }
    });
  };

  return (
    <div>
      <PageHeader
        title="Content Studio"
        subtitle="Research a client's niche, then generate scripts, posts and hooks — multiple angles, rendered for every platform."
        actions={
          <Button onClick={() => setOpen((v) => !v)} className="gap-1.5">
            <Plus className="w-4 h-4" /> New brand
          </Button>
        }
      />

      {open && (
        <div className="rounded-xl border bg-card p-4 mb-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs text-muted-foreground">Brand name</label>
              <Input value={form.name} onChange={set("name")} placeholder="Crown Roofers" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Client (optional)</label>
              <select
                value={form.customer_id}
                onChange={set("customer_id")}
                className="w-full h-9 text-sm border rounded-md px-2 bg-background"
              >
                <option value="">Our own brand</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Trade / industry</label>
              <Input value={form.industry} onChange={set("industry")} placeholder="Roofing" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Service area</label>
              <Input value={form.service_area} onChange={set("service_area")} placeholder="Western Sydney" />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">
              Services — one per line. The scout researches these, so be specific.
            </label>
            <Textarea
              value={form.services}
              onChange={set("services")}
              rows={3}
              placeholder={"Roof restoration\nLeak repairs\nGutter replacement\nStorm damage"}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Who are they talking to?</label>
            <Input
              value={form.audience}
              onChange={set("audience")}
              placeholder="Homeowners 35-65 in older brick homes; some strata managers"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Voice — how they actually talk</label>
            <Textarea
              value={form.voice}
              onChange={set("voice")}
              rows={2}
              placeholder="Straight-talking tradie. No jargon, no hype. Explains the why, gives a real number."
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">
              Banned phrases — one per line. The voice agent strips these.
            </label>
            <Textarea
              value={form.banned_phrases}
              onChange={set("banned_phrases")}
              rows={2}
              placeholder={"game-changer\nunlock\nin today's fast-paced world"}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            You can fill in the rest — proof points, example posts — on the brand&apos;s Voice tab.
          </p>
          <div className="flex gap-2">
            <Button onClick={submit} disabled={pending}>
              {pending ? "Adding…" : "Add brand"}
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {brands.length === 0 ? (
        <div className="ch-empty">
          <Megaphone className="w-8 h-8 mx-auto mb-2 text-muted-foreground/60" />
          <p>No brands yet.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Add one to research its niche and start generating content.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {brands.map((b) => (
            <div key={b.id} className="group rounded-xl border bg-card p-4 hover:border-primary/40 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <Link href={`/content/${b.id}`} className="flex-1 min-w-0">
                  <p className="font-semibold text-sm break-words">{b.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {b.industry ?? "No trade set"}
                    {b.service_area ? ` · ${b.service_area}` : ""}
                  </p>
                </Link>
                <button
                  onClick={() => remove(b)}
                  disabled={pending}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                  aria-label={`Remove ${b.name}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              {b.services.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {b.services.slice(0, 4).map((s) => (
                    <span key={s} className="text-[10px] rounded-full border px-1.5 py-0.5 text-muted-foreground">
                      {s}
                    </span>
                  ))}
                  {b.services.length > 4 && (
                    <span className="text-[10px] text-muted-foreground">+{b.services.length - 4}</span>
                  )}
                </div>
              )}
              {!b.voice && (
                <p className="text-[11px] text-amber-600 dark:text-amber-500 mt-2">
                  No voice set — content will sound generic.
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
