import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { canEdit, type Role } from "@/lib/permissions";
import { listAppointments, getBookingSettings } from "@/lib/actions/booking";
import { BookingsPageClient } from "@/components/booking/bookings-page-client";

export default async function BookingsPage() {
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
  if (!canEdit(role)) redirect("/dashboard");

  const [appointments, settings] = await Promise.all([
    listAppointments({ limit: 300 }),
    getBookingSettings(),
  ]);

  return <BookingsPageClient initialAppointments={appointments} timezone={settings.timezone} />;
}
