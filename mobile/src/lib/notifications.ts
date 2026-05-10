import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";
import type { WorkOrderWithCustomer } from "./types";

/**
 * Local push reminders for upcoming jobs. We schedule one per assigned job
 * the day before at 6pm and again 60 minutes before the start time. Cheap,
 * works offline, no server-side push setup needed.
 */
export async function ensureNotificationPermissions(): Promise<boolean> {
  if (!Device.isDevice) return false;

  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === "granted") return true;

  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== "granted") return false;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("jobs", {
      name: "Job reminders",
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  return true;
}

const SCHEDULED_KEY = (jobId: string, kind: "evening" | "hour") => `job:${jobId}:${kind}`;

export async function scheduleJobReminders(jobs: WorkOrderWithCustomer[]): Promise<void> {
  const granted = await ensureNotificationPermissions();
  if (!granted) return;

  // Cancel everything we previously scheduled so we don't pile up duplicates.
  // We store the trigger id in a tag-like identifier so we can find ours.
  const existing = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    existing
      .filter((n) => n.identifier.startsWith("job:"))
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier))
  );

  for (const job of jobs) {
    if (!job.scheduled_date) continue;
    if (job.status === "completed" || job.status === "cancelled") continue;

    const start = jobStart(job);
    if (!start) continue;
    const now = Date.now();

    // Evening before, 6pm local
    const evening = new Date(start);
    evening.setDate(evening.getDate() - 1);
    evening.setHours(18, 0, 0, 0);
    if (evening.getTime() > now) {
      await Notifications.scheduleNotificationAsync({
        identifier: SCHEDULED_KEY(job.id, "evening"),
        content: {
          title: "Job tomorrow",
          body: `${job.title} · ${humanTime(start)} · ${job.property_address ?? job.customers?.name ?? ""}`.trim(),
          data: { jobId: job.id },
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: evening },
      });
    }

    // 60 minutes before start
    const oneHour = new Date(start.getTime() - 60 * 60 * 1000);
    if (oneHour.getTime() > now) {
      await Notifications.scheduleNotificationAsync({
        identifier: SCHEDULED_KEY(job.id, "hour"),
        content: {
          title: "Job starts in 1 hour",
          body: `${job.title} · ${job.property_address ?? job.customers?.name ?? ""}`.trim(),
          data: { jobId: job.id },
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: oneHour },
      });
    }
  }
}

/** Schedule an owner morning briefing — once a day at 9am local, with the
 *  count of overdue invoices, stale quotes, and new leads. Cheap, offline,
 *  no server push needed. The actual numbers are looked up at the moment
 *  the notification fires via the data the caller passes in here. */
export async function scheduleOwnerBriefing(opts: {
  overdueInvoices: number;
  staleQuotes:     number;
  newLeads:        number;
  unassignedToday: number;
}): Promise<void> {
  const granted = await ensureNotificationPermissions();
  if (!granted) return;

  // Wipe previous briefing notifications
  const existing = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    existing
      .filter((n) => n.identifier.startsWith("brief:"))
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier))
  );

  const total = opts.overdueInvoices + opts.staleQuotes + opts.newLeads + opts.unassignedToday;
  if (total === 0) return; // nothing to chase, don't bug the user

  const parts: string[] = [];
  if (opts.overdueInvoices > 0)  parts.push(`${opts.overdueInvoices} overdue`);
  if (opts.unassignedToday > 0)  parts.push(`${opts.unassignedToday} unassigned today`);
  if (opts.staleQuotes > 0)      parts.push(`${opts.staleQuotes} stale quote${opts.staleQuotes === 1 ? "" : "s"}`);
  if (opts.newLeads > 0)         parts.push(`${opts.newLeads} new lead${opts.newLeads === 1 ? "" : "s"}`);

  // Tomorrow at 9am
  const next = new Date();
  next.setDate(next.getDate() + 1);
  next.setHours(9, 0, 0, 0);

  await Notifications.scheduleNotificationAsync({
    identifier: "brief:morning",
    content: {
      title: "Morning briefing",
      body:  parts.join(" · "),
      data:  { route: "/assistant" },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: next },
  });
}

function jobStart(job: WorkOrderWithCustomer): Date | null {
  if (!job.scheduled_date) return null;
  const time = job.start_time ?? "08:00";
  const iso = `${job.scheduled_date}T${time.length === 5 ? `${time}:00` : time}`;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

function humanTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

// Foreground behavior: still alert the user.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList:   true,
    shouldPlaySound:  true,
    shouldSetBadge:   false,
  }),
});
