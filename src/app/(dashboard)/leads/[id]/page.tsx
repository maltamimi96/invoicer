import { notFound } from "next/navigation";
import { getLead } from "@/lib/actions/leads";
import { LeadDetailClient } from "@/components/leads/lead-detail-client";
import {
  getOnboardingSettings, getOnboardingForms, getOnboardingResponsesForLead, getSecureFieldsAvailable,
} from "@/lib/actions/onboarding";
import { staffFillableFields } from "@/lib/onboarding/staff-fill";
import type { LeadOnboardingData } from "@/components/leads/lead-onboarding-card";

/** Onboarding data for a lead — only when the plugin is on. Never break the
 *  page over it: a lead is useful without its forms. */
async function loadLeadOnboarding(leadId: string): Promise<LeadOnboardingData | null> {
  try {
    const settings = await getOnboardingSettings();
    if (!settings.enabled) return null;
    const [forms, responses, allowSecureFill] = await Promise.all([
      getOnboardingForms(),
      getOnboardingResponsesForLead(leadId),
      getSecureFieldsAvailable(),
    ]);
    return {
      forms: forms
        .filter((f) => f.status !== "archived" && staffFillableFields(f.schema).length > 0)
        .map((f) => ({ id: f.id, name: f.name, schema: f.schema })),
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
