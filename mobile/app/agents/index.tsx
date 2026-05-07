import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Switch, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { ArrowLeft, Bot } from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import { useActiveBusiness } from "@/lib/active-business";
import { colors, radius, space } from "@/lib/theme";

interface AgentDef {
  id:    string;
  label: string;
  hint:  string;
}

/** Mirror of the web app's known agent ids. Keep in sync as new agents land. */
const AGENT_CATALOG: AgentDef[] = [
  { id: "daily-digest",       label: "Daily digest",        hint: "7am summary email of yesterday + today" },
  { id: "invoice-reminders",  label: "Invoice reminders",   hint: "Nudge customers about overdue invoices" },
  { id: "quote-followup",     label: "Quote follow-up",     hint: "Follow up on stale sent quotes" },
  { id: "workorder-complete", label: "Job completion",      hint: "Email customer when job is marked complete" },
  { id: "recurring-jobs",     label: "Recurring jobs",      hint: "Auto-create scheduled jobs on cadence" },
];

export default function AgentsList() {
  const router = useRouter();
  const { active } = useActiveBusiness();
  const [installs, setInstalls] = useState<Record<string, boolean> | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    if (!active) return;
    const { data } = await supabase
      .from("business_agent_installs")
      .select("agent_id, enabled")
      .eq("business_id", active.id);
    const map: Record<string, boolean> = {};
    for (const row of (data ?? []) as Array<{ agent_id: string; enabled: boolean }>) {
      map[row.agent_id] = row.enabled;
    }
    setInstalls(map);
  };

  useEffect(() => { load(); }, [active?.id]);

  const toggle = async (agentId: string, enabled: boolean) => {
    if (!active) return;
    setInstalls((prev) => prev ? { ...prev, [agentId]: enabled } : prev);
    await supabase.from("business_agent_installs").upsert(
      { business_id: active.id, agent_id: agentId, enabled, updated_at: new Date().toISOString() },
      { onConflict: "business_id,agent_id" }
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["top", "left", "right"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.sm, gap: space.sm }}>
        <Pressable onPress={() => router.back()} hitSlop={10}><ArrowLeft size={22} color={colors.text} /></Pressable>
        <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text }}>Agents</Text>
      </View>

      {installs === null ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <FlatList
          data={AGENT_CATALOG}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl, gap: space.sm }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.primary} />}
          renderItem={({ item }) => {
            const enabled = installs[item.id] ?? false;
            return (
              <View style={{
                padding: space.md, borderRadius: radius.lg,
                backgroundColor: colors.card, borderWidth: 1, borderColor: colors.hairline,
                flexDirection: "row", alignItems: "center", gap: space.md,
              }}>
                <View style={{ width: 40, height: 40, borderRadius: radius.lg, backgroundColor: enabled ? "#dcfce7" : colors.muted + "33", alignItems: "center", justifyContent: "center" }}>
                  <Bot size={18} color={enabled ? "#16a34a" : colors.muted} />
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: colors.text }}>{item.label}</Text>
                  <Text style={{ fontSize: 11, color: colors.muted }}>{item.hint}</Text>
                </View>
                <Switch
                  value={enabled}
                  onValueChange={(v) => toggle(item.id, v)}
                  trackColor={{ true: colors.primary, false: colors.hairline }}
                />
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}
