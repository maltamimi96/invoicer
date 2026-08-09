import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { getUser } from "@/lib/auth";
import { canEdit, type Role } from "@/lib/permissions";
import { getRecurringExpenses } from "@/lib/actions/recurring-expenses";
import { RecurringExpensesClient } from "@/components/expenses/recurring-expenses-client";

export default async function RecurringExpensesPage() {
  const supabase = await createClient();
  const user = await getUser();
  if (!user) redirect("/auth/login");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const businessId = await getActiveBizId(supabase as any, user.id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: biz } = await (supabase as any).from("businesses")
    .select("user_id, currency").eq("id", businessId).single();

  let role: Role = "owner";
  if (biz?.user_id !== user.id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: m } = await (supabase as any).from("business_members")
      .select("role").eq("business_id", businessId).eq("user_id", user.id)
      .eq("status", "active").maybeSingle();
    role = (m?.role ?? "viewer") as Role;
  }
  // Costs are money out. Viewers read the books; they don't schedule spending.
  if (!canEdit(role)) redirect("/expenses");

  return (
    <RecurringExpensesClient
      initial={await getRecurringExpenses()}
      currency={biz?.currency ?? "AUD"}
    />
  );
}
