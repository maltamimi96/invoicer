import { useEffect, useState, useMemo } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { ArrowLeft, Briefcase } from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import { useActiveBusiness } from "@/lib/active-business";
import { colors, radius, space } from "@/lib/theme";

interface Row {
  id: string;
  number: string;
  title: string | null;
  status: string;
  scheduled_date: string | null;
  customers: { name: string } | null;
}

const STATUS_COLOUR: Record<string, { bg: string; fg: string }> = {
  scheduled:   { bg: "#dbeafe", fg: "#1d4ed8" },
  in_progress: { bg: "#fef3c7", fg: "#92400e" },
  submitted:   { bg: "#ede9fe", fg: "#6d28d9" },
  completed:   { bg: "#dcfce7", fg: "#166534" },
  cancelled:   { bg: "#fee2e2", fg: "#991b1b" },
};

const TABS: Array<{ id: string; label: string }> = [
  { id: "all",         label: "All" },
  { id: "scheduled",   label: "Scheduled" },
  { id: "in_progress", label: "In progress" },
  { id: "submitted",   label: "Submitted" },
  { id: "completed",   label: "Done" },
];

/** Owner / admin work-orders list. Tapping a row opens the portfolio
 *  view (workers, financials, share). The /job/[id] route is the
 *  worker-flavoured field UI used from the Jobs tab. */
export default function WorkOrdersList() {
  const router = useRouter();
  const { active } = useActiveBusiness();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<string>("all");

  const load = async () => {
    if (!active) return;
    const { data } = await supabase
      .from("work_orders")
      .select("id, number, title, status, scheduled_date, customers(name)")
      .eq("business_id", active.id)
      .order("scheduled_date", { ascending: false, nullsFirst: false }).limit(100);
    setRows((data ?? []) as unknown as Row[]);
  };

  useEffect(() => { load(); }, [active?.id]);

  const filtered = useMemo(() => {
    if (!rows) return null;
    if (tab === "all") return rows;
    return rows.filter((r) => r.status === tab);
  }, [rows, tab]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["top", "left", "right"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.sm, gap: space.sm }}>
        <Pressable onPress={() => router.back()} hitSlop={10}><ArrowLeft size={22} color={colors.text} /></Pressable>
        <Briefcase size={18} color={colors.text} />
        <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text }}>Jobs</Text>
        <View style={{ flex: 1 }} />
        <Text style={{ fontSize: 12, color: colors.muted }}>{rows?.length ?? 0}</Text>
      </View>

      <View style={{ flexDirection: "row", gap: 6, paddingHorizontal: space.lg, paddingBottom: space.sm, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <Pressable key={t.id} onPress={() => setTab(t.id)}
            style={({ pressed }) => ({
              paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
              backgroundColor: tab === t.id ? colors.primary : pressed ? colors.muted : colors.card,
              borderWidth: 1, borderColor: tab === t.id ? colors.primary : colors.hairline,
            })}>
            <Text style={{ fontSize: 12, fontWeight: "600", color: tab === t.id ? "#fff" : colors.text }}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      {!rows ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <FlatList
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={7}
          removeClippedSubviews
          data={filtered ?? []}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ padding: space.lg, gap: space.sm }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.primary} />}
          ListEmptyComponent={<Text style={{ color: colors.muted, textAlign: "center", marginTop: space.xl }}>No jobs.</Text>}
          renderItem={({ item }) => {
            const c = STATUS_COLOUR[item.status] ?? { bg: colors.muted, fg: colors.text };
            return (
              <Pressable
                onPress={() => router.push(`/work-orders/${item.id}` as never)}
                style={({ pressed }) => ({
                  padding: space.md, borderRadius: radius.lg,
                  backgroundColor: pressed ? colors.muted : colors.card,
                  borderWidth: 1, borderColor: colors.hairline,
                })}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                  <Text style={{ fontFamily: "monospace", fontSize: 12, color: colors.muted }}>{item.number}</Text>
                  <View style={{ flex: 1 }} />
                  <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: c.bg }}>
                    <Text style={{ fontSize: 10, fontWeight: "700", color: c.fg, textTransform: "uppercase", letterSpacing: 0.5 }}>{item.status}</Text>
                  </View>
                </View>
                <Text style={{ fontSize: 15, fontWeight: "600", color: colors.text, marginTop: 4 }} numberOfLines={1}>{item.title ?? "Untitled"}</Text>
                <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }} numberOfLines={1}>
                  {item.customers?.name ?? "No customer"}
                  {item.scheduled_date ? ` · ${new Date(item.scheduled_date).toLocaleDateString()}` : ""}
                </Text>
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}
