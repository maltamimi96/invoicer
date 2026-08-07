import { notFound } from "next/navigation";
import { getLead } from "@/lib/actions/leads";
import { LeadDetailClient } from "@/components/leads/lead-detail-client";
import {
  getOnboardingSettings, getOnboardingForms, getOnboardingResponsesForLead, getSecureFieldsAvailable,
} from "@/lib/actions/onboarding";
import { staffFillableFields } from "@/lib/onboarding/staff-fill";
import { getFillablePublicForms } from "@/lib/actions/public-form-fill";
import type { StaffFillForm } from "@/components/onboarding/staff-onboarding-fill";
import type { LeadOnboardingData } from "@/components/leads/lead-onboarding-card";

/** Onboarding data for a lead — only when the plugin is on. Never break the
 *  page over it: a lead is useful without its forms. */
async function loadLeadOnboarding(leadId: string): Promise<LeadOnboardingData | null> {
  try {
    const settings = await getOnboardingSettings();
    if (!settings.enabled) return null;
    const [forms, responses, allowSecureFill, publicForms] = await Promise.all([
      getOnboardingForms(),
      getOnboardingResponsesForLead(leadId),
      getSecureFieldsAvailable(),
      // Form Builder forms are fillable here too — same field engine, answers
      // just land in their own table.
      getFillablePublicForms().catch(() => []),
    ]);
    return {
      forms: forms
        .filter((f) => f.status !== "archived" && staffFillableFields(f.schema).length > 0)
        .map((f): StaffFillForm => ({ id: f.id, name: f.name, schema: f.schema, kind: "onboarding" }))
        .concat(publicForms.map((f): StaffFillForm => ({ id: f.id, name: f.name, schema: f.schema, kind: "public" }))),
      responses,
      allowSecureFill,
    };
  } catch {
    return null;
  }
}

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const [lead, onboarding] = await Promise.all([getLead(id), loadLeadOnboarding(id)]);
    return <LeadDetailClient lead={lead} onboarding={onboarding} />;
  } catch {
    notFound();
  }
}
