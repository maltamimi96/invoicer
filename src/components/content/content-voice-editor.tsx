"use client";

/**
 * The brand voice editor.
 *
 * The SEO plugin has a brand-voice-guardian agent and a seo_brand_profiles
 * table that nothing reads or writes — so the agent aligns to a voice it was
 * never told. For social, the voice IS the product, so this is the screen that
 * makes the guardian mean something. Everything here is read by the pipeline on
 * every run (renderBrand in engine.ts).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTrackedRefresh } from "@/components/layout/use-mutation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateContentBrand } from "@/lib/actions/content";
import type { ContentBrand } from "@/types/database";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium">{label}</label>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      {children}
    </div>
  );
}

const area =
  "w-full text-sm rounded-md border bg-background px-3 py-2 min-h-[72px] resize-y";

export function ContentVoiceEditor({ brand }: { brand: ContentBrand }) {
  const router = useRouter();
  // The scrim has to outlast the refresh: a local `finally { setBusy(false) }`
  // fires when refresh() is CALLED, not when the server output arrives.
  const { refresh } = useTrackedRefresh();
  const [pending, start] = useTransition();

  const [form, setForm] = useState({
    industry: brand.industry ?? "",
    service_area: brand.service_area ?? "",
    services: brand.services.join(", "),
    audience: brand.audience ?? "",
    voice: brand.voice ?? "",
    tone: brand.tone ?? "",
    proof_points: brand.proof_points ?? "",
    banned_phrases: brand.banned_phrases.join(", "),
    examples: brand.examples ?? "",
  });

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = () =>
    start(async () => {
      try {
        await updateContentBrand(brand.id, form);
        toast.success("Saved. The next run uses this.");
        refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't save that.");
      }
    });

  return (
    <div className="space-y-4 max-w-2xl">
      <p className="text-xs text-muted-foreground">
        Every agent reads this before it writes a word. The more specific it is, the less the
        output sounds like an AI wrote it.
      </p>

      <div className="rounded-xl border bg-card p-4 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Trade / industry">
            <Input value={form.industry} onChange={set("industry")} placeholder="Roofing" />
          </Field>
          <Field label="Service area">
            <Input
              value={form.service_area}
              onChange={set("service_area")}
              placeholder="Western Sydney, NSW"
            />
          </Field>
        </div>

        <Field label="Services" hint="Comma-separated. The scout looks for topics around these.">
          <Input
            value={form.services}
            onChange={set("services")}
            placeholder="Roof restoration, Leak repairs, Gutter replacement"
          />
        </Field>

        <Field label="Audience" hint="Who's watching — the more real, the better the angles.">
          <textarea
            value={form.audience}
            onChange={set("audience")}
            className={area}
            placeholder="Homeowners 35-65 in older brick homes; some strata managers"
          />
        </Field>
      </div>

      <div className="rounded-xl border bg-card p-4 space-y-4">
        <Field
          label="Voice"
          hint="How they talk. Write it the way you'd brief a new copywriter."
        >
          <textarea
            value={form.voice}
            onChange={set("voice")}
            className={area}
            placeholder="Straight-talking tradie. No jargon, no hype. Explains the why, gives a real number."
          />
        </Field>

        <Field label="Tone">
          <Input
            value={form.tone}
            onChange={set("tone")}
            placeholder="Direct, warm, unimpressed by nonsense"
          />
        </Field>

        <Field
          label="Proof points"
          hint="Claims they can actually stand behind. The compliance agent flags anything beyond these."
        >
          <textarea
            value={form.proof_points}
            onChange={set("proof_points")}
            className={area}
            placeholder="Licensed NSW builder. 18 years trading. 10-year workmanship warranty."
          />
        </Field>

        <Field
          label="Banned phrases"
          hint="Comma-separated. The voice guardian strips these — use it for whatever makes you wince."
        >
          <Input
            value={form.banned_phrases}
            onChange={set("banned_phrases")}
            placeholder="game-changer, unlock, elevate, in today's fast-paced world"
          />
        </Field>

        <Field
          label="Examples"
          hint="Paste a few of their posts that actually landed. This does more than every other field combined."
        >
          <textarea
            value={form.examples}
            onChange={set("examples")}
            className={`${area} min-h-[140px]`}
            placeholder="Paste real posts, one per line…"
          />
        </Field>
      </div>

      <Button onClick={save} disabled={pending}>
        {pending ? "Saving…" : "Save voice"}
      </Button>
    </div>
  );
}
