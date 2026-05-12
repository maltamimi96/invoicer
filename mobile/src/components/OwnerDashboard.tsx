import { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { AlertTriangle, Clock, DollarSign, FileCheck, Wrench, UserPlus, ArrowRight } from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import { colors, gradients, radius, space, timeOfDayGradient } from "@/lib/theme";
import type { MobileBusiness } from "@/lib/active-business";
import { BriefingWidget } from "./BriefingWidget";
import { TasksWidget } from "./TasksWidget";
import { OutlookWidget } from "./OutlookWidget";
import { GradientCard } from "./GradientCard";
import { FadeIn } from "./FadeIn";
import { PatternBackground } from "./PatternBackground";
import { AnimatedNumber } from "./AnimatedNumber";
import { Skeleton } from "./Skeleton";
import { BrandedRefresh } from "./BrandedRefresh";
import { useResponsive } from "@/lib/responsive";
import { scheduleOwnerBriefing } from "@/lib/notifications";
import { loadBriefing } from "@/lib/briefing";

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

/** Owner-flavoured landing screen — gradient hero, KPI grid, briefing,
 *  tasks, and ops outlook. Pulls live from Supabase using RLS. */
export function OwnerDashboard({ business }: { business: MobileBusiness }) {
  const router = useRouter();
  const r = useResponsive();
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

  // Schedule the morning briefing once a day. Re-runs whenever the dashboard
  // opens, which is fine — scheduling is idempotent.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const items = await loadBriefing(business.id);
      if (cancelled) return;
      await scheduleOwnerBriefing({
        overdueInvoices: items.filter((i) => i.type === "overdue_invoice").length,
        staleQuotes:     items.filter((i) => i.type === "stale_quote").length,
        newLeads:        items.filter((i) => i.type === "new_lead").length,
        unassignedToday: items.filter((i) => i.type === "today_job_unassigned").length,
      });
    })().catch(() => {});
    return () => { cancelled = true; };
  }, [business.id]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const heroPalette = timeOfDayGradient();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.canvas }}
      contentContainerStyle={{
        padding: space.lg, gap: space.md, paddingBottom: space.xxl,
        // Cap width on tablet/landscape so the dashboard doesn't stretch
        // edge-to-edge and become uncomfortable to scan.
        ...r.containerStyle,
      }}
      refreshControl={<BrandedRefresh refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Hero — gradient with subtle dot pattern */}
      <FadeIn>
        <View style={{ borderRadius: radius.xxl, overflow: "hidden" }}>
          <LinearGradient
            colors={heroPalette as unknown as readonly [string, string, ...string[]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ padding: space.lg + 4, minHeight: 130 }}
          >
            <PatternBackground variant="dots" color="#fff" opacity={0.18} />
            <Text style={{ fontSize: 12, fontWeight: "700", color: "rgba(255,255,255,0.8)", letterSpacing: 1.4, textTransform: "uppercase" }}>
              {greeting()}
            </Text>
            <Text style={{ fontSize: 26, fontWeight: "800", color: "#fff", letterSpacing: -0.6, marginTop: 4 }} numberOfLines={1}>
              {business.name}
            </Text>
            <Text style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", marginTop: 6 }}>
              {loading ? "Loading today…" : `${stats.jobs_today} job${stats.jobs_today === 1 ? "" : "s"} today · ${fmtMoney(stats.outstanding, currency)} outstanding`}
            </Text>
          </LinearGradient>
        </View>
      </FadeIn>

      {/* Overdue strip — red gradient */}
      {stats.overdue > 0 && (
        <FadeIn delay={60}>
          <GradientCard
            gradient="rose"
            onPress={() => router.push("/invoices" as never)}
            contentStyle={{ padding: space.md, flexDirection: "row", alignItems: "center", gap: space.md }}
          >
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" }}>
              <AlertTriangle size={20} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: "700", color: "#fff" }}>{fmtMoney(stats.overdue, currency)} overdue</Text>
              <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.85)" }}>Tap to chase invoices</Text>
            </View>
            <ArrowRight size={18} color="rgba(255,255,255,0.85)" />
          </GradientCard>
        </FadeIn>
      )}

      {/* KPI grid — clean cards with a small coloured icon chip + a bold,
          max-contrast value (colors.text). The previous "dark teal on pale
          teal" combo read as muddy on light mode and washed out on dark. */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
        <FadeIn delay={120} style={{ flexBasis: r.gridBasis, flexGrow: 1 }}>
          <GradientStat
            gradient="softTeal"
            icon={<DollarSign size={16} color={colors.primary} />}
            label="Outstanding"
            value={stats.outstanding}
            format={(n) => fmtMoney(n, currency)}
            loading={loading}
            valueColor={colors.text}
            labelColor={colors.primary}
          />
        </FadeIn>
        <FadeIn delay={160} style={{ flexBasis: r.gridBasis, flexGrow: 1 }}>
          <GradientStat
            gradient="softRose"
            icon={<Clock size={16} color="#dc2626" />}
            label="Overdue"
            value={stats.overdue}
            format={(n) => fmtMoney(n, currency)}
            loading={loading}
            valueColor={colors.text}
            labelColor="#dc2626"
          />
        </FadeIn>
        <FadeIn delay={200} style={{ flexBasis: r.gridBasis, flexGrow: 1 }}>
          <GradientStat
            gradient="softBlue"
            icon={<Wrench size={16} color="#1d4ed8" />}
            label="Jobs today"
            value={stats.jobs_today}
            loading={loading}
            valueColor={colors.text}
            labelColor="#1d4ed8"
          />
        </FadeIn>
        <FadeIn delay={240} style={{ flexBasis: r.gridBasis, flexGrow: 1 }}>
          <GradientStat
            gradient="softViolet"
            icon={<FileCheck size={16} color="#7c3aed" />}
            label="Draft quotes"
            value={stats.draft_quotes}
            loading={loading}
            valueColor={colors.text}
            labelColor="#7c3aed"
          />
        </FadeIn>
      </View>

      {/* New leads strip — emerald gradient */}
      {stats.new_leads_7d > 0 && (
        <FadeIn delay={280}>
          <GradientCard
            gradient="emerald"
            onPress={() => router.push("/leads" as never)}
            contentStyle={{ padding: space.md, flexDirection: "row", alignItems: "center", gap: space.md }}
          >
            <PatternBackground variant="diagonal" color="#fff" opacity={0.12} />
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" }}>
              <UserPlus size={20} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: "700", color: "#fff" }}>
                {stats.new_leads_7d} new lead{stats.new_leads_7d === 1 ? "" : "s"} this week
              </Text>
              <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.9)" }}>Follow up before they go cold</Text>
            </View>
            <ArrowRight size={18} color="rgba(255,255,255,0.9)" />
          </GradientCard>
        </FadeIn>
      )}

      {/* Briefing */}
      <FadeIn delay={320}>
        <BriefingWidget businessId={business.id} onItemPress={() => router.push("/assistant" as never)} />
      </FadeIn>

      {/* Tasks */}
      <FadeIn delay={360}>
        <TasksWidget businessId={business.id} />
      </FadeIn>

      {/* Operations */}
      <FadeIn delay={400}>
        <OutlookWidget businessId={business.id} />
      </FadeIn>
    </ScrollView>
  );
}

function GradientStat({ gradient, icon, label, value, format, loading, valueColor, labelColor }: {
  gradient: "softTeal" | "softRose" | "softBlue" | "softViolet" | "softAmber";
  icon: React.ReactNode;
  label: string;
  value: number;
  format?: (n: number) => string;
  loading?: boolean;
  valueColor: string;
  labelColor: string;
}) {
  return (
    <LinearGradient
      colors={gradients[gradient] as unknown as readonly [string, string, ...string[]]}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={{
        padding: space.md,
        borderRadius: radius.lg,
        gap: 6,
        minHeight: 92,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        {icon}
        <Text style={{ fontSize: 11, fontWeight: "700", color: labelColor, textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</Text>
      </View>
      {loading ? (
        <Skeleton width="70%" height={22} style={{ marginTop: 4 }} />
      ) : (
        <AnimatedNumber
          value={value}
          format={format}
          style={{ fontSize: 22, fontWeight: "800", color: valueColor, letterSpacing: -0.5, marginTop: 2 }}
        />
      )}
    </LinearGradient>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Late night";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

