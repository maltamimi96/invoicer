import { useEffect, useState, useCallback } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { ArrowLeft, Sparkles, ChevronRight } from "lucide-react-native";
import { useActiveBusiness } from "@/lib/active-business";
import { loadBriefing, BriefingItem, TYPE_LABEL, PRIORITY_BAR } from "@/lib/briefing";
import { colors, radius, space } from "@/lib/theme";

/** Full briefing inbox — same source as the dashboard widget but
 *  unbounded, deep-linked, and pull-to-refresh. */
export default function AssistantPage() {
  const router = useRouter();
  const { active } = useActiveBusiness();
  const [items, setItems] = useState<BriefingItem[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!active) return;
    const out = await loadBriefing(active.id);
    setItems(out);
  }, [active?.id]);

  useEffect(() => { load(); }, [load]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["top", "left", "right"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.sm, gap: space.sm }}>
        <Pressable onPress={() => router.back()} hitSlop={10}><ArrowLeft size={22} color={colors.text} /></Pressable>
        <Sparkles size={18} color={colors.primary} />
        <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text }}>Assistant</Text>
        <View style={{ flex: 1 }} />
        {items && (
          <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: items.length > 0 ? "#fee2e2" : "#dcfce7" }}>
            <Text style={{ fontSize: 11, fontWeight: "700", color: items.length > 0 ? "#991b1b" : "#166534" }}>{items.length}</Text>
          </View>
        )}
      </View>

      {items === null ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : items.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: space.xl, gap: 6 }}>
          <Text style={{ fontSize: 18, fontWeight: "700", color: colors.text }}>Inbox zero</Text>
          <Text style={{ fontSize: 13, color: colors.muted, textAlign: "center" }}>
            Nothing overdue, no stale quotes, no unhandled leads. You're all caught up.
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ paddingBottom: space.xl }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.primary} />}
          ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: colors.hairline, marginHorizontal: space.lg }} />}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(item.deepLink as never)}
              style={({ pressed }) => ({
                flexDirection: "row", alignItems: "center", gap: space.sm,
                paddingHorizontal: space.lg, paddingVertical: space.md,
                backgroundColor: pressed ? colors.muted : "transparent",
                borderLeftWidth: 4, borderLeftColor: PRIORITY_BAR[item.priority],
              })}
            >
              <Text style={{ fontSize: 10, fontWeight: "700", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.6, width: 64 }}>
                {TYPE_LABEL[item.type]}
              </Text>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: "600", color: colors.text }}>{item.title}</Text>
                <Text numberOfLines={1} style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>{item.subtitle}</Text>
              </View>
              <ChevronRight size={16} color={colors.muted} />
            </Pressable>
          )}
        />
      )}

      <View style={{ padding: space.md, alignItems: "center", borderTopWidth: 1, borderTopColor: colors.hairline, backgroundColor: colors.card }}>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: PRIORITY_BAR.high }} />
          <Text style={{ fontSize: 11, color: colors.muted }}>High</Text>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: PRIORITY_BAR.med, marginLeft: space.sm }} />
          <Text style={{ fontSize: 11, color: colors.muted }}>Medium</Text>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: PRIORITY_BAR.low, marginLeft: space.sm }} />
          <Text style={{ fontSize: 11, color: colors.muted }}>Low</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
