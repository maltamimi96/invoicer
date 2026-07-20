import { ScheduleView } from "@/screens/ScheduleView";

/** Worker tab 2 — the same day-grouped schedule the admin UI uses.
 *  fetchMyWorkOrders relies on RLS (my_member_profile_ids), so a worker only
 *  ever receives their own assigned jobs from it. */
export default function WorkerScheduleTab() {
  return <ScheduleView />;
}
