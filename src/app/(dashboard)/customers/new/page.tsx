import { CustomerForm } from "@/components/customers/customer-form";
import { getBusiness } from "@/lib/actions/business";
import { getClientFieldConfig } from "@/lib/actions/client-fields";
import { getOnboardingSettings, getOnboardingForms } from "@/lib/actions/onboarding";
import { staffFillableFields } from "@/lib/onboarding/staff-fill";
import { PageHeader } from "@/components/layout/page-header";
import type { StaffFillForm } from "@/components/onboarding/staff-onboarding-fill";

/** Forms staff can fill in here — only when the plugin is on, and only forms
 *  with something they can actually answer. Never break the page over it. */
async function loadFillableForms(): Promise<StaffFillForm[]> {
  try {
    const settings = await getOnboardingSettings();
    if (!settings.enabled) return [];
    const forms = await getOnboardingForms();
    return forms
      .filter((f) => f.status !== "archived" && staffFillableFields(f.schema).length > 0)
      .map((f) => ({ id: f.id, name: f.name, schema: f.schema }));
  } catch {
    return [];
  }
}

export default async function NewCustomerPage() {
  const [business, fieldConfig, onboardingForms] = await Promise.all([
    getBusiness().catch(() => null),
    getClientFieldConfig().catch(() => null),
    loadFillableForms(),
  ]);
  return (
    <div className="max-w-3xl mx-auto">
      <PageHeader
        title="New customer"
        subtitle="Add a customer to your account"
        accent="linear-gradient(180deg, #3a847e 0%, #1f4f4a 100%)"
      />
      <CustomerForm
        businessCountry={business?.country ?? null}
        clientFields={fieldConfig?.fields ?? []}
        onboardingForms={onboardingForms}
      />
    </div>
  );
}
