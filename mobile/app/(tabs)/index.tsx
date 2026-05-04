import { useEffect, useMemo } from "react";
import { ActivityIndicator, FlatList, RefreshControl, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { fetchMyWorkOrders } from "@/lib/jobs";
import { scheduleJobReminders } from "@/lib/notifications";
import { JobCard } from "@/components/JobCard";
import { colors, space } from "@/lib/theme";

export default function JobsScreen() {
  const { data: jobs, isLoading, isRefetching, refetch, error } = useQuery({
    queryKey: ["work-orders"],
    queryFn:  fetchMyWorkOrders,
  });

  // Re-schedule local reminders whenever the job list changes.
  useEffect(() => {
    if (jobs && jobs.length) scheduleJobReminders(jobs).catch(() => undefined);
  }, [jobs]);

  const { todayJobs, upcoming, completed } = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    const todayJobs: typeof jobs = [];
    const upcoming:  typeof jobs = [];
    const completed: typeof jobs = [];
    for (const j of jobs ?? []) {
      if (j.status === "completed" || j.status === "cancelled") completed!.push(j);
      else if (j.scheduled_date === today || j.status === "in_progress") todayJobs!.push(j);
      else upcoming!.push(j);
    }
    return { todayJobs, upcoming, completed };
  }, [jobs]);

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
              My jobs
            </Text>
            <Text style={{ fontSize: 13, color: colors.muted, marginTop: 4 }}>
              {jobs?.length ?? 0} total · pull to refresh
            </Text>
          </View>
        }
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
        data={[]}
        keyExtractor={() => "section-shell"}
        renderItem={null}
        ListFooterComponent={
          <View>
            {error ? (
              <ErrorBox message={(error as Error).message} />
            ) : (
              <>
                <Section title="Today & active" jobs={todayJobs ?? []} emptyHint="Nothing scheduled for today." />
                <Section title="Upcoming"        jobs={upcoming  ?? []} emptyHint="No upcoming jobs assigned to you." />
                {(completed?.length ?? 0) > 0 && (
                  <Section title="Recently completed" jobs={(completed ?? []).slice(0, 5)} />
                )}
              </>
            )}
          </View>
        }
      />
    </SafeAreaView>
  );
}

function Section({ title, jobs, emptyHint }: { title: string; jobs: NonNullable<Awaited<ReturnType<typeof fetchMyWorkOrders>>>; emptyHint?: string }) {
  return (
    <View style={{ marginBottom: space.xl }}>
      <Text
        style={{
          fontSize: 11,
          fontWeight: "700",
          color: colors.muted,
          textTransform: "uppercase",
          letterSpacing: 1,
          marginBottom: space.sm,
        }}
      >
        {title}
      </Text>
      {jobs.length === 0 ? (
        emptyHint ? (
          <Text style={{ color: colors.muted, fontSize: 13, paddingVertical: 8 }}>{emptyHint}</Text>
        ) : null
      ) : (
        jobs.map((j) => <JobCard key={j.id} job={j} />)
      )}
    </View>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <View style={{ backgroundColor: "#fee2e2", padding: space.lg, borderRadius: 16, marginTop: space.lg }}>
      <Text style={{ color: "#991b1b", fontWeight: "600", marginBottom: 4 }}>Couldn&apos;t load jobs</Text>
      <Text style={{ color: "#7f1d1d", fontSize: 12 }}>{message}</Text>
    </View>
  );
}
