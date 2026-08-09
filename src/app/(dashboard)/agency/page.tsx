import { getClientAccounts } from "@/lib/actions/agency-console";
import { ClientAccountsClient } from "@/components/agency/client-accounts-client";

export default async function AgencyConsolePage() {
  const accounts = await getClientAccounts();
  return <ClientAccountsClient accounts={accounts} />;
}
