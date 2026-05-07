import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View, Pressable, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { ArrowLeft, TrendingUp } from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import { useActiveBusiness } from "@/lib/active-business";
import { colors, radius, space } from "@/lib/theme";

interface Stats {
  revenue: number;          // paid invoices in window
  outstanding: number;      // unpaid balance
  overdue: number;          // unpaid past due_date
  invoiced: number;         // total invoiced in window
  paid_count: number;
  draft_quotes: number;
  accepted_quotes: number;
  new_leads: number;
}

const num = (v: unknown) => { const n = typeof v === "number" ? v : parseFloat(String(v ?? 0)); return Number.isFinite(n) ? n : 0; };
function fmtMoney(n: number, currency: string): string {
  try { return new Intl.NumberFormat("en-AU", { style: "currency", currency, maximumFractionDigits: 0 }).format(n); }
  catch { return `${currency} ${n.toFixed(0)}`; }
}

const RANGES = [
  { id: "30d",  label: "30d",  days: 30  },
  { id: "90d",  label: "90d",  days: 90  },
  { id: "12m",  label: "12m",  days: 365 },
  { id: "ytd",  label: "YTD",  days: 0   },
] as const;

export default function Analytics() {
  const router = useRouter();
  const { active } = useActiveBusiness();
  const [range, setRange] = useState<typeof RANGES[number]["id"]>("90d");
  const [stats, setStats] = useState<Stats | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const currency = active?.currency ?? "AUD";

  const load = async () => {
    if (!active) return;
    const cfg = RANGES.find((r) => r.id === range)!;
    const fromIso = cfg.id === "ytd"
      ? new Date(new Date().getFullYear(), 0, 1).toISOString()
      : new Date(Date.now() - cfg.days * 86_400_000).toISOString();

    const [{ data: invoices }, { data: quotes }, { data: leads }] = await Promise.all([
      supabase.from("invoices").select("status, total, amount_paid, created_at, due_date").eq("business_id", active.id),
      supabase.from("quotes").select("status, total, created_at").eq("business_id", active.id),
      supabase.from("leads").select("created_at").eq("business_id", active.id).gte("created_at", fromIso),
    ]);

    const today = new Date();
    let revenue = 0, invoiced = 0, outstanding = 0, overdue = 0, paid_count = 0;
    for (const i of (invoices ?? []) as Array<{ status: string; total: unknown; amount_paid: unknown; created_at: string; due_date: string | null }>) {
      const total = num(i.total); const paid = num(i.amount_paid);
      const isPaid = i.status === "paid";
      const isOpen = ["sent", "partial", "overdue"].includes(i.status);
      if (i.created_at >= fromIso) {
        invoiced += total;
        if (isPaid) { revenue += total; paid_count += 1; }
      }
      if (isOpen) {
        outstanding += Math.max(0, total - paid);
        if (i.due_date && new Date(i.due_date) < today) overdue += Math.max(0, total - paid);
      }
    }

    let draft_quotes = 0, accepted_quotes = 0;
    for (const q of (quotes ?? []) as Array<{ status: string; created_at: string }>) {
      if (q.status === "draft") draft_quotes += 1;
      if (q.status === "accepted" && q.created_at >= fromIso) accepted_quotes += 1;
    }

    setStats({
      revenue, outstanding, overdue, invoiced, paid_count,
      draft_quotes, accepted_quotes,
      new_leads: (leads ?? []).length,
    });
  };

  useEffect(() => { load(); }, [active?.id, range]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["top", "left", "right"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.sm, gap: space.sm }}>
        <Pressable onPress={() => router.back()} hitSlop={10}><ArrowLeft size={22} color={colors.text} /></Pressable>
        <TrendingUp size={20} color={colors.primary} />
        <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text }}>Analytics</Text>
      </View>
      {/* Range pills */}
      <View style={{ flexDirection: "row", gap: 6, paddingHorizontal: space.lg, paddingBottom: space.sm }}>
        {RANGES.map((r) => (
          <Pressable key={r.id} onPress={() => setRange(r.id)}
            style={({ pressed }) => ({
              paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
              backgroundColor: range === r.id ? colors.primary : pressed ? colors.muted : colors.card,
              borderWidth: 1, borderColor: range === r.id ? colors.primary : colors.hairline,
            })}>
            <Text style={{ fontSize: 12, fontWeight: "600", color: range === r.id ? "#fff" : colors.text }}>{r.label}</Text>
          </Pressable>
        ))}
      </View>

      {!stats ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: space.lg, gap: space.md }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.primary} />}
        >
          {/* Headline */}
          <View style={{ padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.primarySoft }}>
            <Text style={{ fontSize: 11, color: colors.primaryText, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: "700" }}>
              Revenue (paid)
            </Text>
            <Text style={{ fontSize: 32, fontWeight: "700", color: colors.primaryText, letterSpacing: -0.5, marginTop: 4 }}>
              {fmtMoney(stats.revenue, currency)}
            </Text>
            <Text style={{ fontSize: 12, color: colors.primaryText, marginTop: 4, opacity: 0.8 }}>
              {stats.paid_count} paid invoices · invoiced {fmtMoney(stats.invoiced, currency)}
            </Text>
          </View>

          {/* KPI grid */}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
            <Stat label="Outstanding" value={fmtMoney(stats.outstanding, currency)} />
            <Stat label="Overdue"     value={fmtMoney(stats.overdue, currency)} accent="#dc2626" />
            <Stat label="New leads"   value={String(stats.new_leads)} />
            <Stat label="Quotes won"  value={String(stats.accepted_quotes)} />
            <Stat label="Draft quotes" value={String(stats.draft_quotes)} />
          </View>

          <Text style={{ fontSize: 11, color: colors.muted, textAlign: "center", marginTop: space.md }}>
            More charts (revenue trend, top customers, A/R aging) coming next phase
          </Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <View style={{
      flexBasis: "48%", flexGrow: 1, padding: space.md, borderRadius: radius.lg,
      backgroundColor: colors.card, borderWidth: 1, borderColor: colors.hairline, gap: 4,
    }}>
      <Text style={{ fontSize: 11, fontWeight: "600", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</Text>
      <Text style={{ fontSize: 18, fontWeight: "700", color: accent ?? colors.text, letterSpacing: -0.3 }}>{value}</Text>
    </View>
  );
}
