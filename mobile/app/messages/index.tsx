import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Linking, Pressable, RefreshControl, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { ArrowLeft, MessageSquare } from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import { useActiveBusiness } from "@/lib/active-business";
import { colors, radius, space } from "@/lib/theme";

interface Conv {
  id:              string;
  customer_name:   string;
  customer_phone:  string;
  unread_count:    number;
  last_message_at: string | null;
}

/** SMS inbox — list of conversations with unread counts. Tap a row to
 *  open the customer (their detail page has Call/SMS buttons). Live
 *  message thread editor is a follow-up. */
export default function MessagesInbox() {
  const router = useRouter();
  const { active } = useActiveBusiness();
  const [convs, setConvs] = useState<Conv[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    if (!active) return;
    const { data } = await supabase
      .from("sms_conversations")
      .select("id, customer_name, customer_phone, unread_count, last_message_at")
      .eq("business_id", active.id)
      .order("last_message_at", { ascending: false, nullsFirst: false });
    setConvs((data ?? []) as Conv[]);
  };

  useEffect(() => { load(); }, [active?.id]);

  const totalUnread = (convs ?? []).reduce((s, c) => s + (c.unread_count ?? 0), 0);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["top", "left", "right"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.sm, gap: space.sm }}>
        <Pressable onPress={() => router.back()} hitSlop={10}><ArrowLeft size={22} color={colors.text} /></Pressable>
        <MessageSquare size={18} color={colors.text} />
        <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text }}>Messages</Text>
        <View style={{ flex: 1 }} />
        {totalUnread > 0 && (
          <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: "#fee2e2" }}>
            <Text style={{ fontSize: 11, fontWeight: "700", color: "#991b1b" }}>{totalUnread} new</Text>
          </View>
        )}
      </View>

      {!convs ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <FlatList
          data={convs}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: space.lg, gap: space.sm }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={{ alignItems: "center", padding: space.xl, gap: 6 }}>
              <MessageSquare size={36} color={colors.muted} />
              <Text style={{ fontWeight: "700", color: colors.text }}>No messages yet</Text>
              <Text style={{ fontSize: 12, color: colors.muted, textAlign: "center" }}>
                Customer replies to your SMS appear here.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const unread = item.unread_count ?? 0;
            return (
              <Pressable
                onPress={() => Linking.openURL(`sms:${item.customer_phone.replace(/\s/g, "")}`)}
                style={({ pressed }) => ({
                  padding: space.md, borderRadius: radius.lg,
                  backgroundColor: pressed ? colors.muted : colors.card,
                  borderWidth: 1, borderColor: unread > 0 ? colors.primary : colors.hairline,
                  flexDirection: "row", alignItems: "center", gap: space.sm,
                })}>
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: unread > 0 ? colors.primary : colors.muted + "33", alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontSize: 13, fontWeight: "700", color: unread > 0 ? "#fff" : colors.text }}>
                    {item.customer_name.slice(0, 1).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 14, fontWeight: unread > 0 ? "700" : "600", color: colors.text }} numberOfLines={1}>
                    {item.customer_name}
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }} numberOfLines={1}>
                    {item.customer_phone}
                    {item.last_message_at ? ` · ${new Date(item.last_message_at).toLocaleString()}` : ""}
                  </Text>
                </View>
                {unread > 0 && (
                  <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: "#dc2626" }}>
                    <Text style={{ fontSize: 11, fontWeight: "700", color: "#fff" }}>{unread}</Text>
                  </View>
                )}
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}
