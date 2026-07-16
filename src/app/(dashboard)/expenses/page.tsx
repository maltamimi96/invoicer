import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { listExpenses } from "@/lib/actions/expenses";
import { ExpensesView } from "@/components/expenses/expenses-view";

export default async function ExpensesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const businessId = await getActiveBizId(supabase as any, user.id);

  const [expenses, workOrdersRes] = await Promise.all([
    listExpenses(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from("work_orders").select("id, number, title").eq("business_id", businessId).order("created_at", { ascending: false }).limit(300),
  ]);

  return (
    <ExpensesView
      expenses={expenses}
      workOrders={(workOrdersRes.data ?? []) as { id: string; number: string | null; title: string | null }[]}
    />
  );
}
