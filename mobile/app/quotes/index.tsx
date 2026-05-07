import { useEffect, useState, useMemo } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import { useActiveBusiness } from "@/lib/active-business";
import { colors, radius, space } from "@/lib/theme";

interface QuoteRow {
  id: string;
  number: string;
  status: "draft" | "sent" | "accepted" | "rejected" | "expired";
  total: unknown;
  issue_date: string | null;
  expiry_date: string | null;
  customers: { name: string } | null;
}

const STATUS_COLOUR: Record<QuoteRow["status"], { bg: string; fg: string }> = {
  draft:    { bg: "#fef3c7", fg: "#92400e" },
  sent:     { bg: "#dbeafe", fg: "#1d4ed8" },
  accepted: { bg: "#dcfce7", fg: "#166534" },
  rejected: { bg: "#fee2e2", fg: "#991b1b" },
  expired:  { bg: "#e5e7eb", fg: "#374151" },
};

const TABS: Array<{ id: "all" | QuoteRow["status"]; label: string }> = [
  { id: "all", label: "All" },
  { id: "draft", label: "Draft" },
  { id: "sent", label: "Sent" },
  { id: "accepted", label: "Won" },
];

const num = (v: unknown) => { const n = typeof v === "number" ? v : parseFloat(String(v ?? 0)); return Number.isFinite(n) ? n : 0; };
function fmtMoney(n: number, currency: string): string {
  try { return new Intl.NumberFormat("en-AU", { style: "currency", currency, maximumFractionDigits: 0 }).format(n); }
  catch { return `${currency} ${n.toFixed(0)}`; }
}

export default function QuotesList() {
  const router = useRouter();
  const { active } = useActiveBusiness();
  const [quotes, setQuotes] = useState<QuoteRow[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<typeof TABS[number]["id"]>("all");

  const currency = active?.currency ?? "AUD";

  const load = async () => {
    if (!active) return;
    const { data } = await supabase
      .from("quotes")
      .select("id, number, status, total, issue_date, expiry_date, customers(name)")
      .eq("business_id", active.id)
      .order("created_at", { ascending: false });
    setQuotes((data ?? []) as unknown as QuoteRow[]);
  };

  useEffect(() => { load(); }, [active?.id]);

  const filtered = useMemo(() => {
    if (!quotes) return null;
    if (tab === "all") return quotes;
    return quotes.filter((q) => q.status === tab);
  }, [quotes, tab]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["top", "left", "right"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.sm, gap: space.sm }}>
        <Pressable onPress={() => router.back()} hitSlop={10}><ArrowLeft size={22} color={colors.text} /></Pressable>
        <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text }}>Quotes</Text>
        <View style={{ flex: 1 }} />
        <Text style={{ fontSize: 12, color: colors.muted }}>{quotes?.length ?? 0}</Text>
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
      {quotes === null ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={colors.primary} /></View>
      ) : filtered!.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: space.xl }}>
          <Text style={{ fontSize: 14, color: colors.muted }}>No quotes in this view</Text>
        </View>
      ) : (
        <FlatList
          data={filtered!}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xxl }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.primary} />}
          renderItem={({ item }) => {
            const c = STATUS_COLOUR[item.status];
            return (
              <Pressable
                onPress={() => router.push(`/quotes/${item.id}` as never)}
                style={({ pressed }) => ({
                  padding: space.md, borderRadius: radius.lg,
                  backgroundColor: pressed ? colors.muted : colors.card,
                  borderWidth: 1, borderColor: colors.hairline, gap: 6,
                })}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={{ fontFamily: "monospace", fontSize: 12, color: colors.muted }}>{item.number}</Text>
                  <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: c.bg }}>
                    <Text style={{ fontSize: 10, fontWeight: "700", color: c.fg, textTransform: "uppercase" }}>{item.status}</Text>
                  </View>
                </View>
                <Text style={{ fontSize: 15, fontWeight: "600", color: colors.text }}>{item.customers?.name ?? "No customer"}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <Text style={{ fontSize: 11, color: colors.muted }}>
                    {item.issue_date ?? "Draft"}{item.expiry_date ? ` · expires ${item.expiry_date}` : ""}
                  </Text>
                  <Text style={{ fontSize: 16, fontWeight: "700", color: colors.text, letterSpacing: -0.4 }}>{fmtMoney(num(item.total), currency)}</Text>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}
