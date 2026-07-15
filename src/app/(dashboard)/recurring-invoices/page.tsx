import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { canEdit, type Role } from "@/lib/permissions";
import { getRecurringInvoices } from "@/lib/actions/recurring-invoices";
import { getCustomers } from "@/lib/actions/customers";
import { getProducts } from "@/lib/actions/products";
import { RecurringInvoicesClient } from "@/components/recurring/recurring-invoices-client";

export default async function RecurringInvoicesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const businessId = await getActiveBizId(supabase as any, user.id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: biz } = await (supabase as any).from("businesses")
    .select("user_id, currency, stripe_charges_enabled").eq("id", businessId).single();

  let role: Role = "owner";
  if (biz?.user_id !== user.id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: m } = await (supabase as any).from("business_members")
      .select("role").eq("business_id", businessId).eq("user_id", user.id).eq("status", "active").maybeSingle();
    role = (m?.role ?? "viewer") as Role;
  }
  if (!canEdit(role)) redirect("/dashboard");

  const [schedules, customers, products] = await Promise.all([
    getRecurringInvoices(),
    getCustomers(),
    getProducts(),
  ]);

  return (
    <RecurringInvoicesClient
      initial={schedules}
      customers={customers}
      products={products}
      currency={biz?.currency ?? "GBP"}
      stripeEnabled={!!biz?.stripe_charges_enabled}
    />
  );
}
