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
