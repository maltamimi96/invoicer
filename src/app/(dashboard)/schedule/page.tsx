import { getScheduledJobs } from "@/lib/actions/schedule";
import { getMemberProfiles } from "@/lib/actions/member-profiles";
import { getCustomers } from "@/lib/actions/customers";
import { ScheduleClient } from "@/components/schedule/schedule-client";

function weekBoundsForDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    start: monday.toISOString().split("T")[0],
    end: sunday.toISOString().split("T")[0],
  };
}

function weekBounds(offset = 0) {
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1) + offset * 7);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    start: monday.toISOString().split("T")[0],
    end: sunday.toISOString().split("T")[0],
  };
}

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date } = await searchParams;
  const { start, end } = date ? weekBoundsForDate(date) : weekBounds(0);
  const [jobs, profiles, customers] = await Promise.all([
    getScheduledJobs(start, end),
    getMemberProfiles(),
    getCustomers(),
  ]);

  return (
    <ScheduleClient
      initialJobs={jobs}
      initialStart={start}
      initialEnd={end}
      profiles={profiles}
      customers={customers}
    />
  );
}
