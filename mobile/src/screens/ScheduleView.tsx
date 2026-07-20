import { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { ArrowDownUp } from "lucide-react-native";
import { fetchMyWorkOrders } from "@/lib/jobs";
import { JobCard } from "@/components/JobCard";
import { colors, radius, space } from "@/lib/theme";
import type { WorkOrderWithCustomer } from "@/lib/types";

type SortMode = "soonest" | "newest";

interface DayGroup { date: string; jobs: WorkOrderWithCustomer[] }
interface ListSection {
  kind: "today-header" | "today-empty" | "today-job" | "rest-header" | "day-header" | "day-job";
  id: string;
  date?: string;
  job?: WorkOrderWithCustomer;
}

export function ScheduleView() {
  const [sort, setSort] = useState<SortMode>("soonest");
  const { data: jobs, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ["work-orders"],
    queryFn:  fetchMyWorkOrders,
  });

  const { todayKey, today, rest } = useMemo(() => groupSchedule(jobs ?? [], sort), [jobs, sort]);

  // Flatten everything into one list so a single FlatList renders both the
  // pinned Today section and the rest below it.
  const items: ListSection[] = useMemo(() => {
    const out: ListSection[] = [{ kind: "today-header", id: "today-h", date: todayKey }];
    if (today.length === 0) out.push({ kind: "today-empty", id: "today-empty" });
    else today.forEach((j) => out.push({ kind: "today-job", id: "t-" + j.id, job: j }));
    if (rest.length > 0) out.push({ kind: "rest-header", id: "rest-h" });
    for (const g of rest) {
      out.push({ kind: "day-header", id: "d-" + g.date, date: g.date });
      for (const j of g.jobs) out.push({ kind: "day-job", id: g.date + "-" + j.id, job: j });
    }
    return out;
  }, [todayKey, today, rest]);

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
          <View style={{ paddingTop: space.md, paddingBottom: space.md }}>
            <Text style={{ fontSize: 28, fontWeight: "700", color: colors.text, letterSpacing: -0.5 }}>Schedule</Text>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6 }}>
              <Text style={{ fontSize: 13, color: colors.muted }}>
                {today.length} today · {rest.reduce((s, g) => s + g.jobs.length, 0)} upcoming
              </Text>
              <Pressable onPress={() => setSort((s) => s === "soonest" ? "newest" : "soonest")}
                style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: radius.pill ?? 999, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.hairline }}>
                <ArrowDownUp size={13} color={colors.text} />
                <Text style={{ fontSize: 12, color: colors.text, fontWeight: "700" }}>
                  {sort === "soonest" ? "Soonest first" : "Newest first"}
                </Text>
              </Pressable>
            </View>
          </View>
        }
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
        data={items}
        keyExtractor={(it) => it.id}
        renderItem={({ item }) => {
          if (item.kind === "today-header") return (
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, marginBottom: space.sm, marginTop: space.sm }}>
              <View style={{ width: 4, height: 18, borderRadius: 2, backgroundColor: colors.primary }} />
              <Text style={{ fontSize: 16, fontWeight: "800", color: colors.text }}>Today</Text>
              <Text style={{ fontSize: 12, color: colors.muted }}>· {format(parseISO(item.date!), "EEE d MMM")}</Text>
            </View>
          );
          if (item.kind === "today-empty") return (
            <View style={{ padding: space.md, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.hairline, marginBottom: space.lg }}>
              <Text style={{ fontSize: 13, color: colors.muted, textAlign: "center" }}>No jobs today.</Text>
            </View>
          );
          if (item.kind === "today-job") return <View style={{ marginBottom: space.xs ?? 6 }}><JobCard job={item.job!} /></View>;
          if (item.kind === "rest-header") return (
            <View style={{ marginTop: space.lg, marginBottom: space.sm, flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={{ flex: 1, height: 1, backgroundColor: colors.hairline }} />
              <Text style={{ fontSize: 11, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: "700" }}>Upcoming</Text>
              <View style={{ flex: 1, height: 1, backgroundColor: colors.hairline }} />
            </View>
          );
          if (item.kind === "day-header") return (
            <Text style={{ fontSize: 13, fontWeight: "700", color: colors.text, marginBottom: space.sm, marginTop: space.md }}>{prettyDay(item.date!)}</Text>
          );
          return <View style={{ marginBottom: space.xs ?? 6 }}><JobCard job={item.job!} /></View>;
        }}
        ListEmptyComponent={
          <Text style={{ color: colors.muted, textAlign: "center", marginTop: space.xxl }}>No scheduled jobs yet.</Text>
        }
      />
    </SafeAreaView>
  );
}

function groupSchedule(jobs: WorkOrderWithCustomer[], sort: SortMode) {
  const todayKey = new Date().toISOString().split("T")[0];
  const byDay = new Map<string, WorkOrderWithCustomer[]>();
  for (const j of jobs) {
    if (!j.scheduled_date) continue;
    if (j.status === "completed" || j.status === "cancelled") continue;
    const arr = byDay.get(j.scheduled_date) ?? [];
    arr.push(j);
    byDay.set(j.scheduled_date, arr);
  }
  // Sort jobs within each day by start_time ascending (earliest first).
  for (const arr of byDay.values()) {
    arr.sort((a, b) => (a.start_time ?? "23:59").localeCompare(b.start_time ?? "23:59"));
  }
  const today = byDay.get(todayKey) ?? [];
  byDay.delete(todayKey);
  const rest: DayGroup[] = Array.from(byDay.entries())
    .sort(([a], [b]) => sort === "soonest" ? a.localeCompare(b) : b.localeCompare(a))
    .map(([date, jobs]) => ({ date, jobs }));
  return { todayKey, today, rest };
}

function prettyDay(iso: string) {
  try {
    const d = parseISO(iso);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const cmp   = new Date(iso); cmp.setHours(0, 0, 0, 0);
    const diff  = Math.round((cmp.getTime() - today.getTime()) / 86_400_000);
    if (diff === 1)  return "Tomorrow · " + format(d, "EEE d MMM");
    if (diff === -1) return "Yesterday · " + format(d, "EEE d MMM");
    return format(d, "EEEE d MMM");
  } catch { return iso; }
}
