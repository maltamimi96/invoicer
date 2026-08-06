import { Suspense } from "react";
import { notFound } from "next/navigation";
import { DetailSkeleton } from "@/components/layout/detail-skeleton";
import { getCustomer } from "@/lib/actions/customers";
import { getInvoices } from "@/lib/actions/invoices";
import { getQuotes } from "@/lib/actions/quotes";
import { getBusiness } from "@/lib/actions/business";
import { getWorkOrders } from "@/lib/actions/work-orders";
import { getReports } from "@/lib/actions/reports";
import { getCustomerProperties, getCustomerContacts, getCustomerNotes } from "@/lib/actions/customer-hub";
import { getBillingProfilesForAccount } from "@/lib/actions/billing-profiles";
import {
  getOnboardingSettings, getOnboardingRequests, getOnboardingResponsesForCustomer, getOnboardingForms,
  getSecureFieldsAvailable,
} from "@/lib/actions/onboarding";
import { getClientFieldConfig } from "@/lib/actions/client-fields";
import { CustomerDetailClient, type CustomerOnboardingData } from "@/components/customers/customer-detail-client";

/** Onboarding tab data — only when the plugin is enabled; never break the page. */
async function loadOnboarding(customerId: string): Promise<CustomerOnboardingData | null> {
  try {
    const settings = await getOnboardingSettings();
    if (!settings.enabled) return null;
    const [requests, responses, forms, secureOk] = await Promise.all([
      getOnboardingRequests({ customer_id: customerId }),
      getOnboardingResponsesForCustomer(customerId),
      getOnboardingForms(),
      getSecureFieldsAvailable(),
    ]);
    return {
      requests,
      responses,
      activeForms: forms
        .filter((f) => f.status !== "archived" && f.schema.length > 0)
        .map((f) => ({
          id: f.id,
          name: f.name,
          schema: f.schema,
          // Say why up front rather than after they hit Send. A secure field
          // with no encryption key can't be submitted by the customer at all.
          blocked: !secureOk && f.schema.some((x) => x.type === "secure")
            ? "has a secure credential field, but the server has no encryption key set"
            : null,
        })),
    };
  } catch {
    return null;
  }
}

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Stream: the shell + detail skeleton reach the browser immediately while
  // the ~11 data fetches below settle (notFound() still works inside the
  // Suspense child — it propagates to the not-found boundary).
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <CustomerDetailContent id={id} />
    </Suspense>
  );
}

async function CustomerDetailContent({ id }: { id: string }) {
  try {
    const [customer, invoices, quotes, business, workOrders, reports, properties, contacts, notes, billingProfiles, onboarding, fieldConfig] = await Promise.all([
      getCustomer(id),
      getInvoices({ customer_id: id }),
      getQuotes({ customer_id: id }),
      getBusiness(),
      getWorkOrders({ customer_id: id }),
      getReports({ customer_id: id }),
      getCustomerProperties(id).catch(() => []),
      getCustomerContacts(id).catch(() => []),
      getCustomerNotes(id).catch(() => []),
      getBillingProfilesForAccount(id).catch(() => []),
      loadOnboarding(id),
      getClientFieldConfig().catch(() => null),
    ]);
    return (
      <CustomerDetailClient
        customer={customer}
        invoices={invoices}
        quotes={quotes}
        workOrders={workOrders}
        reports={reports}
        properties={properties}
        contacts={contacts}
        notes={notes}
        billingProfiles={billingProfiles}
        currency={business.currency}
        businessCountry={business.country ?? null}
        onboarding={onboarding}
        clientFields={fieldConfig?.fields ?? []}
      />
    );
  } catch {
    notFound();
  }
}
