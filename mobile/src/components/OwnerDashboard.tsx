import { useEffect, useState } from "react";
import { ScrollView, Text, View, Pressable, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { AlertTriangle, Clock, DollarSign, FileCheck, Wrench, UserPlus } from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import { colors, radius, space } from "@/lib/theme";
import type { MobileBusiness } from "@/lib/active-business";
import { BriefingWidget } from "./BriefingWidget";
import { TasksWidget } from "./TasksWidget";
import { OutlookWidget } from "./OutlookWidget";

interface Stats {
  outstanding: number;
  overdue: number;
  jobs_today: number;
  draft_quotes: number;
  new_leads_7d: number;
}

const ZERO: Stats = { outstanding: 0, overdue: 0, jobs_today: 0, draft_quotes: 0, new_leads_7d: 0 };

const num = (v: unknown) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? 0));
  return Number.isFinite(n) ? n : 0;
};

function fmtMoney(n: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-AU", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${currency} ${n.toFixed(0)}`;
  }
}

/** Owner-flavored landing screen — KPI strip + headline counts + quick actions.
 *  Pulls live from Supabase using RLS, no server actions needed. */
export function OwnerDashboard({ business }: { business: MobileBusiness }) {
  const router = useRouter();
  const [stats, setStats] = useState<Stats>(ZERO);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const currency = business.currency ?? "AUD";
  const today = new Date().toISOString().split("T")[0];
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();

  const load = async () => {
    const [{ data: invoices }, { data: jobs }, { data: quotes }, { data: leads }] = await Promise.all([
      supabase.from("invoices")
        .select("status, total, amount_paid, due_date")
        .eq("business_id", business.id)
        .in("status", ["sent", "partial", "overdue"]),
      supabase.from("work_orders")
        .select("id")
        .eq("business_id", business.id)
        .eq("scheduled_date", today),
      supabase.from("quotes")
        .select("id")
        .eq("business_id", business.id)
        .eq("status", "draft"),
      supabase.from("leads")
        .select("id")
        .eq("business_id", business.id)
        .gte("created_at", weekAgo),
    ]);

    const now = new Date();
    let outstanding = 0;
    let overdue = 0;
    for (const inv of (invoices ?? []) as Array<{ status: string; total: unknown; amount_paid: unknown; due_date: string | null }>) {
      const balance = Math.max(0, num(inv.total) - num(inv.amount_paid));
      outstanding += balance;
      if (inv.due_date && new Date(inv.due_date) < now) overdue += balance;
    }

    setStats({
      outstanding,
      overdue,
      jobs_today: (jobs ?? []).length,
      draft_quotes: (quotes ?? []).length,
      new_leads_7d: (leads ?? []).length,
    });
    setLoading(false);
  };

  useEffect(() => { load(); }, [business.id]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: space.lg, gap: space.md }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      {/* Greeting */}
      <View>
        <Text style={{ fontSize: 22, fontWeight: "700", color: colors.text, letterSpacing: -0.4 }}>
          {greeting()}.
        </Text>
        <Text style={{ fontSize: 13, color: colors.muted, marginTop: 4 }}>
          Here&apos;s what&apos;s happening today.
        </Text>
      </View>

      {/* Overdue strip */}
      {stats.overdue > 0 && (
        <Pressable
          onPress={() => {/* Navigate to invoices filter overdue when that screen exists */}}
          style={{
            flexDirection: "row", alignItems: "center", gap: space.md,
            padding: space.md, borderRadius: radius.lg,
            backgroundColor: "#fef2f2", borderWidth: 1, borderColor: "#fecaca",
          }}
        >
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#fee2e2", alignItems: "center", justifyContent: "center" }}>
            <AlertTriangle size={18} color="#b91c1c" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: "600", color: "#7f1d1d" }}>{fmtMoney(stats.overdue, currency)} overdue</Text>
            <Text style={{ fontSize: 12, color: "#991b1b" }}>Send reminders to bring these in</Text>
          </View>
        </Pressable>
      )}

      {/* KPI grid */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
        <Stat icon={<DollarSign size={14} color={colors.muted} />} label="Outstanding" value={loading ? "…" : fmtMoney(stats.outstanding, currency)} />
        <Stat icon={<Clock size={14} color="#b45309" />} label="Overdue" value={loading ? "…" : fmtMoney(stats.overdue, currency)} accent="#b45309" />
        <Stat icon={<Wrench size={14} color={colors.muted} />} label="Jobs today" value={loading ? "…" : String(stats.jobs_today)} />
        <Stat icon={<FileCheck size={14} color={colors.muted} />} label="Draft quotes" value={loading ? "…" : String(stats.draft_quotes)} />
      </View>

      {/* New leads strip */}
      {stats.new_leads_7d > 0 && (
        <Pressable
          onPress={() => router.push("/leads" as never)}
          style={{
            flexDirection: "row", alignItems: "center", gap: space.md,
            padding: space.md, borderRadius: radius.lg,
            backgroundColor: colors.primarySoft,
          }}
        >
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}>
            <UserPlus size={18} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: "600", color: colors.primaryText }}>
              {stats.new_leads_7d} new lead{stats.new_leads_7d === 1 ? "" : "s"} this week
            </Text>
            <Text style={{ fontSize: 12, color: colors.primaryText, opacity: 0.8 }}>Follow up before they go cold</Text>
          </View>
        </Pressable>
      )}

      {/* Briefing */}
      <BriefingWidget businessId={business.id} />

      {/* Tasks */}
      <TasksWidget businessId={business.id} />

      {/* Operations */}
      <OutlookWidget businessId={business.id} />
    </ScrollView>
  );
}

function Stat({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: string }) {
  return (
    <View style={{
      flexBasis: "48%", flexGrow: 1,
      padding: space.md, borderRadius: radius.lg,
      backgroundColor: colors.card, borderWidth: 1, borderColor: colors.hairline,
      gap: 4,
    }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        {icon}
        <Text style={{ fontSize: 11, fontWeight: "600", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</Text>
      </View>
      <Text style={{ fontSize: 22, fontWeight: "700", color: accent ?? colors.text, letterSpacing: -0.5 }}>{value}</Text>
    </View>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Late night";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}
