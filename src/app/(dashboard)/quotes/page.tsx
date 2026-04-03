import { getQuotes } from "@/lib/actions/quotes";
import { getCustomers } from "@/lib/actions/customers";
import { getBusiness } from "@/lib/actions/business";
import { QuotesClient } from "@/components/quotes/quotes-client";

export default async function QuotesPage() {
  const [quotes, customers, business] = await Promise.all([getQuotes(), getCustomers(), getBusiness()]);
  return <QuotesClient quotes={quotes} customers={customers} currency={business.currency} />;
}
