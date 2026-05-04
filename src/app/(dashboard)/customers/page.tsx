import { getCustomers, getCustomerStats } from "@/lib/actions/customers";
import { getBusiness } from "@/lib/actions/business";
import { CustomersClient } from "@/components/customers/customers-client";

export default async function CustomersPage() {
  const [customers, stats, business] = await Promise.all([
    getCustomers(true), // include archived; the client-side tabs filter by status
    getCustomerStats().catch(() => ({})),
    getBusiness().catch(() => null),
  ]);
  return (
    <CustomersClient
      customers={customers}
      stats={stats}
      currency={business?.currency ?? "GBP"}
    />
  );
}
