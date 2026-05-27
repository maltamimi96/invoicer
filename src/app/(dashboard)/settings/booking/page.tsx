import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { canEdit, type Role } from "@/lib/permissions";
import {
  listForms, listAppointmentTypes, listResources, listExceptions, listAppointments,
  listBookingTeamMembers, getBlockUntimedJobs,
} from "@/lib/actions/booking";
import { BookingAdminClient } from "@/components/booking/booking-admin-client";

export const dynamic = "force-dynamic";

export default async function BookingSettingsPage() {
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

  const [forms, types, resources, exceptions, appointments, teamMembers, bizSettings] = await Promise.all([
    listForms(), listAppointmentTypes(), listResources(), listExceptions(),
    listAppointments({ from: new Date().toISOString(), limit: 100 }),
    listBookingTeamMembers(), getBlockUntimedJobs(),
  ]);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://kireihq.com";

  return (
    <BookingAdminClient
      initialForms={forms}
      initialTypes={types}
      initialResources={resources}
      initialExceptions={exceptions}
      initialAppointments={appointments}
      teamMembers={teamMembers}
      blockUntimedJobs={bizSettings}
      appUrl={appUrl}
    />
  );
}
