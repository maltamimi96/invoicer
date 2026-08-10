import { notFound } from "next/navigation";
import { getLead } from "@/lib/actions/leads";
import { LeadDetailClient } from "@/components/leads/lead-detail-client";
import {
  getOnboardingSettings, getOnboardingForms, getOnboardingResponsesForLead, getSecureFieldsAvailable,
} from "@/lib/actions/onboarding";
import { staffFillableFields } from "@/lib/onboarding/staff-fill";
import { getFillablePublicForms, getPublicFormFillsForLead } from "@/lib/actions/public-form-fill";
import { getLeadDocuments } from "@/lib/actions/lead-billing";
import { getBusiness } from "@/lib/actions/business";
import type { StaffFillForm } from "@/components/onboarding/staff-onboarding-fill";
import type { LeadOnboardingData } from "@/components/leads/lead-onboarding-card";

/**
 * Forms for a lead — from BOTH form systems, each gated on its own plugin.
 *
 * This used to bail on `!onboardingSettings.enabled`, which took the custom
 * (Form Builder) forms down with it: a business running Form Builder but not
 * Client Onboarding got no forms section on a lead at all, and no clue one
 * existed. The two plugins are independent everywhere else and they are
 * independent here.
 *
 * Never break the page over it: a lead is useful without its forms.
 */
async function loadLeadOnboarding(leadId: string): Promise<LeadOnboardingData | null> {
  try {
    const [onboardingOn, publicForms] = await Promise.all([
      getOnboardingSettings().then((s) => s.enabled).catch(() => false),
      // getFillablePublicForms already returns [] when Form Builder is off.
      getFillablePublicForms().catch(() => []),
    ]);
    if (!onboardingOn && publicForms.length === 0) return null;

    const [forms, responses, publicFills, allowSecureFill] = await Promise.all([
      onboardingOn ? getOnboardingForms() : Promise.resolve([]),
      getOnboardingResponsesForLead(leadId),
      // Custom-form answers live in their own table. Reading only the
      // onboarding one is why a form filled against a lead vanished.
      getPublicFormFillsForLead(leadId).catch(() => []),
      getSecureFieldsAvailable(),
    ]);
    return {
      // NOT filtered to staff-fillable any more: a form that is all uploads
      // has nothing you can type on their behalf, but sending it to them is
      // exactly the right move. The card decides which of the two buttons to
      // offer per form.
      forms: forms
        .filter((f) => f.status !== "archived" && (f.schema?.length ?? 0) > 0)
        .map((f): StaffFillForm => ({ id: f.id, name: f.name, schema: f.schema, kind: "onboarding" }))
        .concat(publicForms.map((f): StaffFillForm => ({ id: f.id, name: f.name, schema: f.schema, kind: "public" }))),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      responses: [...responses, ...(publicFills as any[])]
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))),
      allowSecureFill,
    };
  } catch {
    return null;
  }
}

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const [lead, onboarding, billing, business] = await Promise.all([
      getLead(id),
      loadLeadOnboarding(id),
      // Never break the lead page over its billing panel.
      getLeadDocuments(id).catch(() => null),
      getBusiness().catch(() => null),
    ]);
    const currency = business?.currency ?? "GBP";
    return <LeadDetailClient lead={lead} onboarding={onboarding} billing={billing} currency={currency} />;
  } catch {
    notFound();
  }
}
