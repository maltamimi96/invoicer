import { useMemo } from "react";
import { ActivityIndicator, FlatList, RefreshControl, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { fetchMyWorkOrders } from "@/lib/jobs";
import { JobCard } from "@/components/JobCard";
import { colors, space } from "@/lib/theme";
import type { WorkOrderWithCustomer } from "@/lib/types";

export default function ScheduleScreen() {
  const { data: jobs, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ["work-orders"],
    queryFn:  fetchMyWorkOrders,
  });

  const groups = useMemo(() => groupByDay(jobs ?? []), [jobs]);

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
          <View style={{ paddingTop: space.md, paddingBottom: space.lg }}>
            <Text style={{ fontSize: 28, fontWeight: "700", color: colors.text, letterSpacing: -0.5 }}>
              Schedule
            </Text>
            <Text style={{ fontSize: 13, color: colors.muted, marginTop: 4 }}>
              {groups.length} {groups.length === 1 ? "day" : "days"} with work
            </Text>
          </View>
        }
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
        data={groups}
        keyExtractor={(g) => g.date}
        renderItem={({ item }) => (
          <View style={{ marginBottom: space.xl }}>
            <Text
              style={{
                fontSize: 13,
                fontWeight: "700",
                color: colors.text,
                marginBottom: space.sm,
                letterSpacing: -0.2,
              }}
            >
              {prettyDay(item.date)}
            </Text>
            {item.jobs.map((j) => <JobCard key={j.id} job={j} />)}
          </View>
        )}
        ListEmptyComponent={
          <Text style={{ color: colors.muted, textAlign: "center", marginTop: space.xxl }}>
            No scheduled jobs yet.
          </Text>
        }
      />
    </SafeAreaView>
  );
}

function groupByDay(jobs: WorkOrderWithCustomer[]) {
  const map = new Map<string, WorkOrderWithCustomer[]>();
  for (const j of jobs) {
    if (!j.scheduled_date) continue;
    if (j.status === "completed" || j.status === "cancelled") continue;
    if (!map.has(j.scheduled_date)) map.set(j.scheduled_date, []);
    map.get(j.scheduled_date)!.push(j);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, jobs]) => ({ date, jobs }));
}

function prettyDay(iso: string) {
  try {
    const d = parseISO(iso);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const cmp   = new Date(iso); cmp.setHours(0, 0, 0, 0);
    const diff  = Math.round((cmp.getTime() - today.getTime()) / 86_400_000);
    if (diff === 0) return "Today · " + format(d, "EEE d MMM");
    if (diff === 1) return "Tomorrow · " + format(d, "EEE d MMM");
    return format(d, "EEEE d MMM");
  } catch {
    return iso;
  }
}
