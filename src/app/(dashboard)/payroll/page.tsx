import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { getUser } from "@/lib/auth";
import { listPayRuns, listEmployees } from "@/lib/actions/payroll";
import { PayrollClient, type LinkableMember } from "@/components/payroll/payroll-client";

export default async function PayrollPage() {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  const [payRuns, employees, membersRes] = await Promise.all([
    listPayRuns(),
    listEmployees(true),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from("member_profiles").select("id, name, email, hourly_rate").eq("business_id", businessId).order("name"),
  ]);

  const members = (membersRes.data ?? []) as LinkableMember[];
  return <PayrollClient payRuns={payRuns} employees={employees} members={members} />;
}
