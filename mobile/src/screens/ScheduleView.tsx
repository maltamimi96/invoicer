import { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { RefreshControl } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { fetchMyWorkOrders } from "@/lib/jobs";
import { JobCard } from "@/components/JobCard";
import { DayChips } from "@/components/Chip";
import { colors, radius, space } from "@/lib/theme";
import type { WorkOrderWithCustomer } from "@/lib/types";

/**
 * "When am I on" — a day-strip across the top (fitness-app vocabulary) drives
 * which day's agenda shows below. Jobs are bucketed by scheduled_date; the
 * strip spans today → the furthest scheduled day, so a worker taps a day and
 * sees exactly that day's run, ordered by start time.
 */
export function ScheduleView() {
  const { data: jobs, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ["work-orders"],
    queryFn:  fetchMyWorkOrders,
  });

  const { byDay, dayKeys } = useMemo(() => groupByDay(jobs ?? []), [jobs]);
  const todayKey = new Date().toISOString().split("T")[0];

  // Default selection: today if it has jobs or is in range, else the first day.
  const [selected, setSelected] = useState<string | null>(null);
  const activeKey = selected ?? (dayKeys.includes(todayKey) ? todayKey : dayKeys[0] ?? todayKey);

  const chips = useMemo(
    () =>
      dayKeys.map((k) => {
        const d = parseISO(k);
        return { key: k, weekday: format(d, "EEE"), day: format(d, "d"), count: byDay.get(k)?.length ?? 0 };
      }),
    [dayKeys, byDay],
  );

  const dayJobs = byDay.get(activeKey) ?? [];

  if (isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["top", "left", "right"]}>
      <FlatList
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xxl }}
        ListHeaderComponent={
          <View style={{ paddingTop: space.sm, paddingBottom: space.md }}>
            <Text style={{ fontSize: 28, fontWeight: "800", color: colors.text, letterSpacing: -0.6 }}>Schedule</Text>
            <Text style={{ fontSize: 13, color: colors.muted, marginTop: 3, marginBottom: space.md }}>
              {byDay.get(todayKey)?.length ?? 0} today · {(jobs ?? []).filter((j) => j.scheduled_date && j.status !== "completed" && j.status !== "cancelled").length} scheduled
            </Text>

            {chips.length > 0 ? (
              <DayChips days={chips} selectedKey={activeKey} onSelect={setSelected} />
            ) : null}

            <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.lg, marginBottom: space.xs }}>
              <View style={{ width: 4, height: 18, borderRadius: 2, backgroundColor: colors.primary }} />
              <Text style={{ fontSize: 16, fontWeight: "800", color: colors.text }}>{prettyDay(activeKey)}</Text>
            </View>
          </View>
        }
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
        data={dayJobs}
        keyExtractor={(j) => j.id}
        renderItem={({ item }) => <JobCard job={item} />}
        ListEmptyComponent={
          <View style={{
            padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.card,
            borderWidth: 1, borderColor: colors.hairline,
          }}>
            <Text style={{ fontSize: 13, color: colors.muted, textAlign: "center" }}>
              {chips.length === 0 ? "No scheduled jobs yet." : "Nothing scheduled this day."}
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

function groupByDay(jobs: WorkOrderWithCustomer[]) {
  const byDay = new Map<string, WorkOrderWithCustomer[]>();
  for (const j of jobs) {
    if (!j.scheduled_date) continue;
    if (j.status === "completed" || j.status === "cancelled") continue;
    const arr = byDay.get(j.scheduled_date) ?? [];
    arr.push(j);
    byDay.set(j.scheduled_date, arr);
  }
  for (const arr of byDay.values()) {
    arr.sort((a, b) => (a.start_time ?? "23:59").localeCompare(b.start_time ?? "23:59"));
  }

  // Build a contiguous day strip from today → the furthest scheduled day, so
  // the chips read like a calendar week even when some days are empty.
  const todayKey = new Date().toISOString().split("T")[0];
  const keys = new Set<string>([todayKey, ...byDay.keys()]);
  const sorted = Array.from(keys).sort();
  const last = sorted[sorted.length - 1];
  const dayKeys: string[] = [];
  const cursor = new Date(todayKey);
  const end = new Date(last);
  // Cap the strip at ~28 days so a stray far-future job can't explode the row.
  for (let i = 0; cursor <= end && i < 28; i++) {
    dayKeys.push(cursor.toISOString().split("T")[0]);
    cursor.setDate(cursor.getDate() + 1);
  }
  return { byDay, dayKeys };
}

function prettyDay(iso: string) {
  try {
    const d = parseISO(iso);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const cmp   = new Date(iso); cmp.setHours(0, 0, 0, 0);
    const diff  = Math.round((cmp.getTime() - today.getTime()) / 86_400_000);
    if (diff === 0)  return "Today · " + format(d, "EEE d MMM");
    if (diff === 1)  return "Tomorrow · " + format(d, "EEE d MMM");
    if (diff === -1) return "Yesterday · " + format(d, "EEE d MMM");
    return format(d, "EEEE d MMM");
  } catch { return iso; }
}
