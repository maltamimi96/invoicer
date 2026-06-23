import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { getContracts, getContractTemplates } from "@/lib/actions/contracts";
import { getCustomers } from "@/lib/actions/customers";
import { ContractsClient } from "@/components/contracts/contracts-client";

export const dynamic = "force-dynamic";

export default async function ContractsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await getActiveBizId(supabase as any, user.id);

  const [contracts, customers, templates] = await Promise.all([
    getContracts(),
    getCustomers(),
    getContractTemplates(),
  ]);

  return <ContractsClient initial={contracts} customers={customers} templates={templates} />;
}
