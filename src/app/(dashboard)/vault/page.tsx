import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { getUser } from "@/lib/auth";
import { listVaultItems, getVaultLog, vaultReady } from "@/lib/actions/vault";
import { VaultClient } from "@/components/vault/vault-client";

export default async function VaultPage() {
  const supabase = await createClient();
  const user = await getUser().catch(() => null);
  if (!user) redirect("/auth/login");
  const businessId = await getActiveBizId(supabase, user.id);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const [items, log, ready, { data: customers }] = await Promise.all([
    listVaultItems(),
    getVaultLog(),
    vaultReady(),
    sb.from("customers").select("id, name").eq("business_id", businessId).order("name").limit(1000),
  ]);

  return (
    <VaultClient
      items={items}
      customers={(customers ?? []) as { id: string; name: string }[]}
      log={log}
      ready={ready}
    />
  );
}
