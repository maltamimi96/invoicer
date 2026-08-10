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
import { listVaultItems, vaultReady } from "@/lib/actions/vault";
import { listPaymentDetails, paymentDetailsReady, type PaymentDetailView } from "@/lib/actions/payment-details";
import type { VaultItemView } from "@/lib/vault/items";

/**
 * Vault tab data — this client's stored logins.
 *
 * Returns null (no tab at all) when the plugin is off OR the viewer isn't an
 * owner/admin: listVaultItems returns [] for anyone else, but an empty tab
 * would advertise that credentials exist and just aren't theirs to see.
 * Deliberately gated on the same flag the sidebar uses, so turning the plugin
 * off removes it from the client profile too.
 */
async function loadVault(customerId: string): Promise<{ items: VaultItemView[]; ready: boolean } | null> {
  try {
    const { createClient } = await import("@/lib/supabase/server");
    const { getActiveBizId } = await import("@/lib/active-business");
    const { getUser } = await import("@/lib/auth");
    const supabase = await createClient();
    const user = await getUser();
    const businessId = await getActiveBizId(supabase, user.id);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const [{ data: settings }, { data: install }] = await Promise.all([
      sb.from("vault_settings").select("enabled").eq("business_id", businessId).maybeSingle(),
      sb.from("business_agent_installs").select("enabled")
        .eq("business_id", businessId).eq("agent_id", "vault").maybeSingle(),
    ]);
    // settingsTable ?? installRow ?? default(false) — the resolver's own order.
    const enabled = settings?.enabled ?? install?.enabled ?? false;
    if (!enabled) return null;

    // RLS already blocks non-admins; this makes the TAB disappear for them
    // rather than showing an empty one.
    const { data: biz } = await sb.from("businesses").select("user_id").eq("id", businessId).single();
    if (biz?.user_id !== user.id) {
      const { data: m } = await sb.from("business_members").select("role")
        .eq("business_id", businessId).eq("user_id", user.id).eq("status", "active").maybeSingle();
      if (m?.role !== "admin") return null;
    }

    const [items, ready] = await Promise.all([listVaultItems(customerId), vaultReady()]);
    return { items, ready };
  } catch {
    return null;
  }
}

/**
 * Stored bank details. Owner/admin only — `listPaymentDetails` already returns
 * [] for anyone else, but returning null here removes the card entirely rather
 * than showing an empty one that implies nothing is stored.
 */
async function loadPaymentDetails(
  customerId: string,
): Promise<{ details: PaymentDetailView[]; ready: boolean } | null> {
  try {
    const [details, ready] = await Promise.all([
      listPaymentDetails(customerId), paymentDetailsReady(),
    ]);
    // No rows AND no key means there is nothing to show and nothing to add.
    if (details.length === 0 && !ready) return null;
    return { details, ready };
  } catch {
    return null;
  }
}

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
      allowSecureFill: secureOk,
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
    const [customer, invoices, quotes, business, workOrders, reports, properties, contacts, notes, billingProfiles, onboarding, fieldConfig, vault, paymentDetails] = await Promise.all([
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
      loadVault(id),
      loadPaymentDetails(id),
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
        vault={vault}
        paymentDetails={paymentDetails}
        clientFields={fieldConfig?.fields ?? []}
        accountTypes={fieldConfig?.accountTypes ?? []}
        cardProviders={{
          stripeEnabled: !!business?.stripe_charges_enabled,
          revolutEnabled: !!business?.revolut_enabled,
        }}
      />
    );
  } catch {
    notFound();
  }
}
