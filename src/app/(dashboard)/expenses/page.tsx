import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { listExpenses } from "@/lib/actions/expenses";
import { getBooksSummary, listExpensesForPeriod } from "@/lib/actions/books";
import type { PeriodKind } from "@/lib/expenses/period";
import { ExpensesView } from "@/components/expenses/expenses-view";
import type { Expense } from "@/types/database";

const KINDS: PeriodKind[] = ["day", "week", "month", "quarter", "fy", "all"];

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; offset?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const businessId = await getActiveBizId(supabase as any, user.id);

  // The period lives in the URL, so a view is shareable and survives a refresh.
  const sp = await searchParams;
  const kind: PeriodKind = KINDS.includes(sp.period as PeriodKind) ? (sp.period as PeriodKind) : "month";
  const parsed = Number(sp.offset);
  const offset = Number.isFinite(parsed) ? parsed : 0;

  const [books, periodExpenses, allExpenses, workOrdersRes] = await Promise.all([
    getBooksSummary(kind, offset),
    listExpensesForPeriod(kind, offset),
    listExpenses(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from("work_orders").select("id, number, title")
      .eq("business_id", businessId).order("created_at", { ascending: false }).limit(300),
  ]);

  return (
    <ExpensesView
      expenses={periodExpenses.expenses as Expense[]}
      allCount={allExpenses.length}
      books={books}
      periodKind={kind}
      offset={offset}
      workOrders={(workOrdersRes.data ?? []) as { id: string; number: string | null; title: string | null }[]}
    />
  );
}
