import { CustomerForm } from "@/components/customers/customer-form";
import { getBusiness } from "@/lib/actions/business";
import { getClientFieldConfig } from "@/lib/actions/client-fields";
import { getOnboardingSettings, getOnboardingForms, getSecureFieldsAvailable } from "@/lib/actions/onboarding";
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
  // A failed config load is REPORTED, not swallowed. Returning empty fields on
  // error is indistinguishable from "this business has no extra fields", which
  // makes a broken page look like a configured one.
  const [business, fieldConfig, onboardingForms, allowSecureFill] = await Promise.all([
    getBusiness().catch(() => null),
    getClientFieldConfig().then(
      (c) => ({ config: c, error: null as string | null }),
      (e: unknown) => ({ config: null, error: e instanceof Error ? e.message : "Couldn't load your client settings" }),
    ),
    loadFillableForms(),
    getSecureFieldsAvailable().catch(() => false),
  ]);

  return (
    <div className="max-w-3xl mx-auto">
      <PageHeader
        title="New customer"
        subtitle="Add a customer to your account"
        accent="linear-gradient(180deg, #3a847e 0%, #1f4f4a 100%)"
      />
      {fieldConfig.error && (
        <p className="mb-4 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {fieldConfig.error} — the standard fields below still work.
        </p>
      )}
      <CustomerForm
        businessCountry={business?.country ?? null}
        clientFields={fieldConfig.config?.fields ?? []}
        accountTypes={fieldConfig.config?.accountTypes ?? []}
        onboardingForms={onboardingForms}
        allowSecureFill={allowSecureFill}
      />
    </div>
  );
}
