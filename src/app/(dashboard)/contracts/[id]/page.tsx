import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { canEdit as roleCanEdit, type Role } from "@/lib/permissions";
import { getContract, renderContractHtml, isSigningEnabled } from "@/lib/actions/contracts";
import { ContractDetailClient } from "@/components/contracts/contract-detail-client";

export const dynamic = "force-dynamic";

export default async function ContractDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const businessId = await getActiveBizId(supabase as any, user.id);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: biz } = await (supabase as any).from("businesses").select("user_id").eq("id", businessId).single();
  let role: Role = "owner";
  if (biz?.user_id !== user.id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: m } = await (supabase as any).from("business_members")
      .select("role").eq("business_id", businessId).eq("user_id", user.id).eq("status", "active").maybeSingle();
    role = (m?.role ?? "viewer") as Role;
  }

  let contract;
  try { contract = await getContract(id); } catch { notFound(); }
  if (!contract) notFound();

  const [renderedHtml, signingEnabled] = await Promise.all([
    contract.kind === "rich_text" ? renderContractHtml(id) : Promise.resolve(""),
    isSigningEnabled(),
  ]);

  return (
    <ContractDetailClient
      contract={contract}
      renderedHtml={renderedHtml}
      canEdit={roleCanEdit(role)}
      signingEnabled={signingEnabled}
    />
  );
}
