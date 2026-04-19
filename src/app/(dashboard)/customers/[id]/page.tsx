import { notFound } from "next/navigation";
import { getCustomer } from "@/lib/actions/customers";
import { getInvoices } from "@/lib/actions/invoices";
import { getQuotes } from "@/lib/actions/quotes";
import { getBusiness } from "@/lib/actions/business";
import { getWorkOrders } from "@/lib/actions/work-orders";
import { getReports } from "@/lib/actions/reports";
import { getCustomerProperties, getCustomerContacts, getCustomerNotes } from "@/lib/actions/customer-hub";
import { getBillingProfilesForAccount } from "@/lib/actions/billing-profiles";
import { CustomerDetailClient } from "@/components/customers/customer-detail-client";

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const [customer, invoices, quotes, business, workOrders, reports, properties, contacts, notes, billingProfiles] = await Promise.all([
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
      />
    );
  } catch {
    notFound();
  }
}
