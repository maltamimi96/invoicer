import { getInvoices } from "@/lib/actions/invoices";
import { getCustomers } from "@/lib/actions/customers";
import { getBusiness } from "@/lib/actions/business";
import { InvoicesClient } from "@/components/invoices/invoices-client";

export default async function InvoicesPage() {
  const [invoices, customers, business] = await Promise.all([getInvoices(), getCustomers(), getBusiness()]);
  return <InvoicesClient invoices={invoices} customers={customers} currency={business.currency} />;
}
