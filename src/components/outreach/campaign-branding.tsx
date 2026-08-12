"use client";

/**
 * Per-campaign email branding.
 *
 * Every control here is TRI-STATE: inherit, or override. The business design in
 * Outreach Settings is the baseline, and a campaign only stores the keys it
 * actually changes — so a later change to the business accent still reaches
 * every campaign that never opted out of it. That is why the empty state of
 * each input means "inherit" rather than "blank", and why each override carries
 * its own Reset.
 *
 * The preview renders through renderOutreachEmail() against the RESOLVED
 * design, so what's on screen is what the engine will send — the same guarantee
 * the settings preview makes.
 */

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, RotateCcw } from "@/components/ui/icons";
import { EMAIL_FONTS, resolveOutreachDesign, type OutreachDesign } from "@/lib/outreach/render";
import { updateCampaign } from "@/lib/actions/outreach";
import { EmailPreview } from "./email-preview";
import type { OutreachCampaign, OutreachCampaignDesign } from "@/types/database";

const SAMPLE_BODY = `Hi {{first_name}},

I wanted to introduce ourselves to {{company}} as a contractor for your portfolio.

Would a quick 10-minute call be worth it?`;

/** A small "this field is overridden — put it back" affordance. */
function Reset({ show, onClick }: { show: boolean; onClick: () => void }) {
  if (!show) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
    >
      <RotateCcw className="h-3 w-3" /> Inherit
    </button>
  );
}

function FieldLabel({
  children, overridden, onReset,
}: { children: React.ReactNode; overridden: boolean; onReset: () => void }) {
  return (
    <div className="mb-1.5 flex items-center justify-between gap-2">
      <Label>{children}</Label>
      <Reset show={overridden} onClick={onReset} />
    </div>
  );
}

export function CampaignBranding({
  campaign, businessDesign, businessName, businessLogoUrl, open, onOpenChange, onDone,
}: {
  campaign: OutreachCampaign;
  /** The business-level design from Outreach Settings — the inherit baseline. */
  businessDesign: Partial<OutreachDesign>;
  businessName: string;
  businessLogoUrl?: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const [draft, setDraft] = useState<OutreachCampaignDesign>(campaign.design ?? {});
  const [busy, setBusy] = useState(false);

  // What the baseline actually is, with app defaults already folded in — this
  // is what each "inherit" placeholder has to show to be truthful.
  const inherited = useMemo(() => resolveOutreachDesign(businessDesign, null), [businessDesign]);
  const resolved = useMemo(() => resolveOutreachDesign(businessDesign, draft), [businessDesign, draft]);

  const has = (k: keyof OutreachCampaignDesign) =>
    draft[k] !== undefined && draft[k] !== null && draft[k] !== "";

  const set = (k: keyof OutreachCampaignDesign, v: unknown) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const clear = (k: keyof OutreachCampaignDesign) =>
    setDraft((d) => {
      const next = { ...d };
      delete next[k];
      return next;
    });

  const overrideCount = Object.keys(draft).filter((k) => has(k as keyof OutreachCampaignDesign)).length;

  const save = async () => {
    setBusy(true);
    try {
      // Strip the keys that mean "inherit" so we never persist a frozen copy of
      // the business design.
      const clean: OutreachCampaignDesign = {};
      for (const k of Object.keys(draft) as (keyof OutreachCampaignDesign)[]) {
        if (has(k)) (clean as Record<string, unknown>)[k] = draft[k];
      }
      await updateCampaign(campaign.id, {
        design: Object.keys(clean).length ? clean : null,
      });
      toast.success(
        Object.keys(clean).length
          ? `Branding saved — ${Object.keys(clean).length} override${Object.keys(clean).length === 1 ? "" : "s"}`
          : "Branding reset — this campaign now inherits Outreach Settings",
      );
      onOpenChange(false);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save branding");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Branding — {campaign.name}</DialogTitle>
          <DialogDescription>
            Anything you leave alone inherits from Outreach Settings, so a change there still
            reaches this campaign. {overrideCount === 0
              ? "Nothing is overridden yet."
              : `${overrideCount} field${overrideCount === 1 ? "" : "s"} overridden.`}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel overridden={has("email_font")} onReset={() => clear("email_font")}>
                  Font
                </FieldLabel>
                <select
                  value={(draft.email_font as string) ?? ""}
                  onChange={(e) => (e.target.value ? set("email_font", e.target.value) : clear("email_font"))}
                  className="flex h-9 w-full rounded-md border border-input bg-card px-3 text-sm"
                >
                  <option value="">
                    Inherit ({(EMAIL_FONTS[inherited.email_font] ?? EMAIL_FONTS.system).label})
                  </option>
                  {Object.entries(EMAIL_FONTS).map(([k, f]) => (
                    <option key={k} value={k}>{f.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <FieldLabel overridden={has("email_width")} onReset={() => clear("email_width")}>
                  Width (px)
                </FieldLabel>
                <Input
                  type="number" min={320} max={900}
                  value={(draft.email_width as number | undefined) ?? ""}
                  placeholder={`Inherit (${inherited.email_width})`}
                  onChange={(e) => (e.target.value ? set("email_width", Number(e.target.value)) : clear("email_width"))}
                />
              </div>

              <div>
                <FieldLabel overridden={has("email_accent")} onReset={() => clear("email_accent")}>
                  Accent
                </FieldLabel>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={resolved.email_accent}
                    onChange={(e) => set("email_accent", e.target.value)}
                    className="h-9 w-12 cursor-pointer rounded-md border border-input bg-card p-1"
                    aria-label="Accent colour"
                  />
                  <Input
                    value={(draft.email_accent as string) ?? ""}
                    placeholder={`Inherit (${inherited.email_accent})`}
                    onChange={(e) => (e.target.value ? set("email_accent", e.target.value) : clear("email_accent"))}
                  />
                </div>
              </div>

              <div>
                <FieldLabel overridden={has("email_text_color")} onReset={() => clear("email_text_color")}>
                  Text colour
                </FieldLabel>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={resolved.email_text_color}
                    onChange={(e) => set("email_text_color", e.target.value)}
                    className="h-9 w-12 cursor-pointer rounded-md border border-input bg-card p-1"
                    aria-label="Text colour"
                  />
                  <Input
                    value={(draft.email_text_color as string) ?? ""}
                    placeholder={`Inherit (${inherited.email_text_color})`}
                    onChange={(e) => (e.target.value ? set("email_text_color", e.target.value) : clear("email_text_color"))}
                  />
                </div>
              </div>
            </div>

            <div>
              <FieldLabel overridden={has("email_show_logo")} onReset={() => clear("email_show_logo")}>
                Logo
              </FieldLabel>
              <select
                value={draft.email_show_logo === undefined || draft.email_show_logo === null
                  ? "" : draft.email_show_logo ? "show" : "hide"}
                onChange={(e) => (e.target.value === ""
                  ? clear("email_show_logo")
                  : set("email_show_logo", e.target.value === "show"))}
                className="flex h-9 w-full rounded-md border border-input bg-card px-3 text-sm"
              >
                <option value="">Inherit ({inherited.email_show_logo ? "shown" : "hidden"})</option>
                <option value="show">Show</option>
                <option value="hide">Hide</option>
              </select>
            </div>

            <div>
              <FieldLabel overridden={has("logo_url")} onReset={() => clear("logo_url")}>
                Logo image URL
              </FieldLabel>
              <Input
                value={(draft.logo_url as string) ?? ""}
                placeholder={businessLogoUrl ? "Inherit (your business logo)" : "https://…/logo.png"}
                onChange={(e) => (e.target.value ? set("logo_url", e.target.value) : clear("logo_url"))}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Give this campaign a different mark. Must be a public https link — anything else is
                dropped at send time rather than shipped to an inbox.
              </p>
            </div>

            <div>
              <FieldLabel overridden={has("signature_html")} onReset={() => clear("signature_html")}>
                Signature (HTML)
              </FieldLabel>
              <Textarea
                rows={5}
                value={(draft.signature_html as string) ?? ""}
                placeholder={inherited.signature_html
                  ? "Inherit (your business signature)"
                  : "<strong>Your Name</strong><br>Your Business<br>0400 000 000"}
                onChange={(e) => (e.target.value ? set("signature_html", e.target.value) : clear("signature_html"))}
              />
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Preview
            </p>
            <EmailPreview
              subject="Preferred contractor for your portfolio"
              body={SAMPLE_BODY}
              design={resolved}
              businessName={businessName}
              businessLogoUrl={businessLogoUrl}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            variant="ghost"
            onClick={() => setDraft({})}
            disabled={busy || overrideCount === 0}
          >
            Reset all to inherited
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
            <Button onClick={save} disabled={busy}>
              {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Save branding
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
