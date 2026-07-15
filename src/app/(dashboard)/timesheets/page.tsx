import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { getTimesheet } from "@/lib/actions/timesheets";
import { TimesheetsView } from "@/components/timesheets/timesheets-view";

function mondayOf(dateISO: string): string {
  const d = new Date(dateISO + "T00:00:00Z");
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().split("T")[0];
}
function addDays(dateISO: string, n: number): string {
  const d = new Date(dateISO + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().split("T")[0];
}

export default async function TimesheetsPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const { week } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await getActiveBizId(supabase as any, user.id);

  const weekStart = mondayOf(week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : new Date().toISOString().split("T")[0]);
  const data = await getTimesheet(weekStart);

  return <TimesheetsView data={data} prevWeek={addDays(weekStart, -7)} nextWeek={addDays(weekStart, 7)} />;
}
