import {
  getAutomationsEnabled, getAutomations, getAutomationRuns,
} from "@/lib/actions/automations";
import { getOnboardingForms } from "@/lib/actions/onboarding";
import { AutomationsClient, AutomationsDisabled } from "@/components/automations/automations-client";

/** Forms an automation can send. Only ones with fields — sending an empty form
 *  fails at run time, and the builder shouldn't offer it. */
async function loadSendableForms(): Promise<Array<{ id: string; name: string }>> {
  try {
    const forms = await getOnboardingForms();
    return forms
      .filter((f) => f.status !== "archived" && (f.schema?.length ?? 0) > 0)
      .map((f) => ({ id: f.id, name: f.name }));
  } catch {
    return [];
  }
}

export default async function AutomationsPage() {
  const enabled = await getAutomationsEnabled();
  if (!enabled) return <AutomationsDisabled />;

  const [automations, runs, forms] = await Promise.all([
    getAutomations(),
    getAutomationRuns(),
    loadSendableForms(),
  ]);

  return <AutomationsClient automations={automations} runs={runs} forms={forms} />;
}
