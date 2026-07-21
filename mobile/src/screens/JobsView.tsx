import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { fetchMyWorkOrders } from "@/lib/jobs";
import { scheduleJobReminders } from "@/lib/notifications";
import { JobCard } from "@/components/JobCard";
import { Chip } from "@/components/Chip";
import { colors, radius, space } from "@/lib/theme";
import type { WorkOrderWithCustomer } from "@/lib/types";

type Filter = "today" | "upcoming" | "done" | "all";

/**
 * The worker's job list — "what am I on".
 *
 * Lifted out of app/(tabs)/index.tsx when workers moved to their own route
 * group. The (tabs) group is now purely the admin UI; nothing in it branches on
 * role any more.
 *
 * A chip row filters by state (Today / Upcoming / Done / All); the list itself
 * is a real FlatList over the filtered jobs so windowing works. Distinct from
 * ScheduleView, which answers "when" and groups by day.
 */
export function JobsView() {
  const [filter, setFilter] = useState<Filter>("today");
  const { data: jobs, isLoading, isRefetching, refetch, error } = useQuery({
    queryKey: ["work-orders"],
    queryFn:  fetchMyWorkOrders,
  });

  // Re-schedule local reminders whenever the job list changes.
  useEffect(() => {
    if (jobs && jobs.length) scheduleJobReminders(jobs).catch(() => undefined);
  }, [jobs]);

  const buckets = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    const t: WorkOrderWithCustomer[] = [];
    const u: WorkOrderWithCustomer[] = [];
    const d: WorkOrderWithCustomer[] = [];
    for (const j of jobs ?? []) {
      if (j.status === "completed" || j.status === "cancelled") d.push(j);
      else if (j.scheduled_date === today || j.status === "in_progress") t.push(j);
      else u.push(j);
    }
    return { today: t, upcoming: u, done: d };
  }, [jobs]);

  const visible =
    filter === "today" ? buckets.today
    : filter === "upcoming" ? buckets.upcoming
    : filter === "done" ? buckets.done
    : [...buckets.today, ...buckets.upcoming, ...buckets.done];

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <FlatList
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xxl }}
      data={visible}
      keyExtractor={(j) => j.id}
      renderItem={({ item }) => <JobCard job={item} />}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
      ListHeaderComponent={
        <View style={{ paddingTop: space.sm, paddingBottom: space.md }}>
          <Text style={{ fontSize: 28, fontWeight: "800", color: colors.text, letterSpacing: -0.6 }}>
            My jobs
          </Text>
          <Text style={{ fontSize: 13, color: colors.muted, marginTop: 3, marginBottom: space.md }}>
            {jobs?.length ?? 0} total · pull to refresh
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <Chip label="Today"    count={buckets.today.length}    selected={filter === "today"}    onPress={() => setFilter("today")} />
            <Chip label="Upcoming" count={buckets.upcoming.length} selected={filter === "upcoming"} onPress={() => setFilter("upcoming")} />
            <Chip label="Done"     count={buckets.done.length}     selected={filter === "done"}     onPress={() => setFilter("done")} />
            <Chip label="All"      selected={filter === "all"}     onPress={() => setFilter("all")} />
          </View>
        </View>
      }
      ListEmptyComponent={
        error ? (
          <ErrorBox message={(error as Error).message} />
        ) : (
          <View style={{
            padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.card,
            borderWidth: 1, borderColor: colors.hairline, marginTop: space.sm,
          }}>
            <Text style={{ fontSize: 14, fontWeight: "700", color: colors.text }}>{emptyTitle(filter)}</Text>
            <Text style={{ fontSize: 13, color: colors.muted, marginTop: 4 }}>{emptyHint(filter)}</Text>
          </View>
        )
      }
    />
  );
}

function emptyTitle(f: Filter): string {
  if (f === "today") return "Nothing on today";
  if (f === "upcoming") return "No upcoming jobs";
  if (f === "done") return "Nothing completed yet";
  return "No jobs assigned";
}
function emptyHint(f: Filter): string {
  if (f === "today") return "Jobs scheduled for today land here.";
  if (f === "upcoming") return "Future assignments will show up here.";
  if (f === "done") return "Finished jobs move here.";
  return "When a job is assigned to you it appears here.";
}

function ErrorBox({ message }: { message: string }) {
  // Theme tokens, not hardcoded hexes: #fee2e2 on a dark canvas was a glaring
  // white slab, and this is the one thing a worker in a dead zone needs to read.
  return (
    <View style={{
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.rose,
      padding: space.lg,
      borderRadius: 16,
      marginTop: space.lg,
    }}>
      <Text style={{ color: colors.rose, fontWeight: "700", marginBottom: 4 }}>Couldn&apos;t load your jobs</Text>
      <Text style={{ color: colors.muted, fontSize: 12 }}>{message}</Text>
      <Text style={{ color: colors.muted, fontSize: 12, marginTop: 6 }}>
        If you&apos;re out of signal this will fix itself — pull down to try again.
      </Text>
    </View>
  );
}
