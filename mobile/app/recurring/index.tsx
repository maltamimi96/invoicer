import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Switch, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { ArrowLeft, Repeat } from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import { useActiveBusiness } from "@/lib/active-business";
import { colors, radius, space } from "@/lib/theme";

interface RecurringRow {
  id: string;
  title: string;
  cadence: "weekly" | "fortnightly" | "monthly" | "quarterly";
  active: boolean;
  next_due_date: string | null;
  customers: { name: string } | null;
}

export default function RecurringList() {
  const router = useRouter();
  const { active } = useActiveBusiness();
  const [items, setItems] = useState<RecurringRow[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    if (!active) return;
    const { data } = await supabase
      .from("recurring_jobs")
      .select("id, title, cadence, active, next_due_date, customers(name)")
      .eq("business_id", active.id)
      .order("next_due_date", { ascending: true, nullsFirst: false }).limit(100);
    setItems((data ?? []) as unknown as RecurringRow[]);
  };

  useEffect(() => { load(); }, [active?.id]);

  const toggleActive = async (id: string, newActive: boolean) => {
    await supabase.from("recurring_jobs").update({ active: newActive }).eq("id", id);
    setItems((prev) => prev?.map((r) => r.id === id ? { ...r, active: newActive } : r) ?? null);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["top", "left", "right"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.sm, gap: space.sm }}>
        <Pressable onPress={() => router.back()} hitSlop={10}><ArrowLeft size={22} color={colors.text} /></Pressable>
        <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text }}>Recurring jobs</Text>
        <View style={{ flex: 1 }} />
        <Text style={{ fontSize: 12, color: colors.muted }}>{items?.length ?? 0}</Text>
      </View>
      {items === null ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={colors.primary} /></View>
      ) : items.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: space.xl, gap: 8 }}>
          <Repeat size={28} color={colors.muted} />
          <Text style={{ fontSize: 14, color: colors.muted }}>No recurring jobs set up</Text>
        </View>
      ) : (
        <FlatList
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={7}
          removeClippedSubviews
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xxl }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.primary} />}
          renderItem={({ item }) => (
            <View style={{
              padding: space.md, borderRadius: radius.lg,
              backgroundColor: colors.card, borderWidth: 1, borderColor: colors.hairline,
              flexDirection: "row", alignItems: "center", gap: space.md,
              opacity: item.active ? 1 : 0.6,
            }}>
              <View style={{ width: 40, height: 40, borderRadius: radius.lg, backgroundColor: "#ede9fe", alignItems: "center", justifyContent: "center" }}>
                <Repeat size={18} color="#7c3aed" />
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: colors.text }} numberOfLines={1}>{item.title}</Text>
                <Text style={{ fontSize: 11, color: colors.muted }}>
                  {item.cadence}{item.customers?.name ? ` · ${item.customers.name}` : ""}
                </Text>
                {item.next_due_date && (
                  <Text style={{ fontSize: 11, color: colors.muted }}>Next: {item.next_due_date}</Text>
                )}
              </View>
              <Switch
                value={item.active}
                onValueChange={(v) => toggleActive(item.id, v)}
                trackColor={{ true: colors.primary, false: colors.hairline }}
              />
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}
