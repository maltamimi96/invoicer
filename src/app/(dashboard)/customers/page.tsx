import { getCustomers } from "@/lib/actions/customers";
import { CustomersClient } from "@/components/customers/customers-client";

export default async function CustomersPage() {
  const customers = await getCustomers();
  return <CustomersClient customers={customers} />;
}
