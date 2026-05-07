import { useEffect, useState } from "react";
import { Pressable, Text, View, ActivityIndicator } from "react-native";
import { Sparkles, ChevronRight } from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import { colors, radius, space } from "@/lib/theme";

interface BriefingItem {
  id:       string;
  type:     "overdue_invoice" | "stale_quote" | "new_lead" | "today_job_unassigned" | "submitted_workorder";
  priority: "high" | "med" | "low";
  title:    string;
  subtitle: string;
}

const TYPE_LABEL: Record<BriefingItem["type"], string> = {
  overdue_invoice:       "Chase",
  stale_quote:           "Follow up",
  new_lead:              "Call",
  today_job_unassigned:  "Assign",
  submitted_workorder:   "Review",
};

const PRIORITY_BAR: Record<BriefingItem["priority"], string> = {
  high: "#ef4444",
  med:  "#f59e0b",
  low:  "#60a5fa",
};

const num = (v: unknown) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? 0));
  return Number.isFinite(n) ? n : 0;
};
const daysAgo = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));

/** Mobile briefing — runs the same logic as the web getMyBriefing server
 *  action but inline against Supabase (RLS scopes to active business).
 *  Snoozes/dismissals deferred to Phase 2. */
export function BriefingWidget({ businessId, onItemPress }: { businessId: string; onItemPress?: () => void }) {
  const [items, setItems]     = useState<BriefingItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const todayStr     = new Date().toISOString().split("T")[0];
      const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();

      const [{ data: invoices }, { data: quotes }, { data: leads }, { data: jobsToday }, { data: submitted }] = await Promise.all([
        supabase.from("invoices").select("id, number, status, total, amount_paid, due_date, customers(name)")
          .eq("business_id", businessId).in("status", ["sent", "partial", "overdue"]),
        supabase.from("quotes").select("id, number, status, updated_at, customers(name)")
          .eq("business_id", businessId).eq("status", "sent").lt("updated_at", sevenDaysAgo),
        supabase.from("leads").select("id, name, status, created_at")
          .eq("business_id", businessId).eq("status", "new"),
        supabase.from("work_orders").select("id, number, title, status, customers(name), work_order_assignments(member_profile_id)")
          .eq("business_id", businessId).eq("scheduled_date", todayStr),
        supabase.from("work_orders").select("id, number, title, customers(name), updated_at")
          .eq("business_id", businessId).eq("status", "submitted"),
      ]);

      const out: BriefingItem[] = [];
      const now = new Date();

      for (const inv of (invoices ?? []) as unknown as Array<{ id: string; number: string; total: unknown; amount_paid: unknown; due_date: string | null; customers: { name: string } | null }>) {
        if (!inv.due_date || new Date(inv.due_date) >= now) continue;
        const balance = Math.max(0, num(inv.total) - num(inv.amount_paid));
        if (balance < 0.01) continue;
        const days = daysAgo(inv.due_date);
        out.push({
          id: `oi:${inv.id}`, type: "overdue_invoice",
          priority: days > 30 ? "high" : days > 14 ? "med" : "low",
          title:    `${inv.number} · ${days}d overdue`,
          subtitle: `${inv.customers?.name ?? "—"} · ${balance.toFixed(2)}`,
        });
      }

      for (const q of (quotes ?? []) as unknown as Array<{ id: string; number: string; updated_at: string; customers: { name: string } | null }>) {
        const days = daysAgo(q.updated_at);
        out.push({
          id: `sq:${q.id}`, type: "stale_quote",
          priority: days > 14 ? "med" : "low",
          title:    `${q.number} · sent ${days}d ago`,
          subtitle: q.customers?.name ?? "No customer",
        });
      }

      for (const l of (leads ?? []) as Array<{ id: string; name: string; created_at: string }>) {
        const days = daysAgo(l.created_at);
        out.push({
          id: `nl:${l.id}`, type: "new_lead",
          priority: days > 2 ? "high" : "med",
          title:    l.name,
          subtitle: days === 0 ? "New today" : `${days}d ago`,
        });
      }

      for (const j of (jobsToday ?? []) as unknown as Array<{ id: string; number: string; title: string; status: string; customers: { name: string } | null; work_order_assignments: Array<{ member_profile_id: string }> }>) {
        const unassigned = !j.work_order_assignments || j.work_order_assignments.length === 0;
        if (unassigned) {
          out.push({
            id: `tu:${j.id}`, type: "today_job_unassigned",
            priority: "high",
            title:    `${j.number} today`,
            subtitle: `${j.title}${j.customers?.name ? ` · ${j.customers.name}` : ""}`,
          });
        }
      }

      for (const w of (submitted ?? []) as unknown as Array<{ id: string; number: string; title: string; customers: { name: string } | null; updated_at: string }>) {
        const days = daysAgo(w.updated_at);
        out.push({
          id: `sw:${w.id}`, type: "submitted_workorder",
          priority: days > 1 ? "high" : "med",
          title:    `${w.number} submitted`,
          subtitle: `${w.title}${w.customers?.name ? ` · ${w.customers.name}` : ""}`,
        });
      }

      const PRI = { high: 0, med: 1, low: 2 };
      out.sort((a, b) => PRI[a.priority] - PRI[b.priority]);
      if (!cancelled) setItems(out.slice(0, 5));
    })().catch(() => { if (!cancelled) setItems([]); });
    return () => { cancelled = true; };
  }, [businessId]);

  return (
    <View style={{ backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.hairline, overflow: "hidden" }}>
      <View style={{ flexDirection: "row", alignItems: "center", padding: space.md, borderBottomWidth: items && items.length > 0 ? 1 : 0, borderBottomColor: colors.hairline, gap: space.sm }}>
        <Sparkles size={14} color={colors.primary} />
        <Text style={{ flex: 1, fontSize: 14, fontWeight: "600", color: colors.text }}>Your briefing</Text>
        {items && items.length > 0 && (
          <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: colors.primarySoft }}>
            <Text style={{ fontSize: 11, fontWeight: "700", color: colors.primary }}>{items.length}</Text>
          </View>
        )}
      </View>
      {items === null ? (
        <View style={{ padding: space.lg, alignItems: "center" }}>
          <ActivityIndicator color={colors.muted} />
        </View>
      ) : items.length === 0 ? (
        <View style={{ padding: space.lg, alignItems: "center", gap: 4 }}>
          <Text style={{ fontSize: 14, fontWeight: "600", color: colors.text }}>Inbox zero</Text>
          <Text style={{ fontSize: 12, color: colors.muted }}>Nothing overdue. Take a break.</Text>
        </View>
      ) : (
        items.map((item) => (
          <Pressable
            key={item.id}
            onPress={onItemPress}
            style={({ pressed }) => ({
              flexDirection: "row", alignItems: "center", gap: space.sm,
              paddingHorizontal: space.md, paddingVertical: space.sm,
              backgroundColor: pressed ? colors.muted : "transparent",
              borderLeftWidth: 3, borderLeftColor: PRIORITY_BAR[item.priority],
            })}
          >
            <Text style={{ fontSize: 10, fontWeight: "700", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.6, width: 64 }}>
              {TYPE_LABEL[item.type]}
            </Text>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: "600", color: colors.text }}>{item.title}</Text>
              <Text numberOfLines={1} style={{ fontSize: 11, color: colors.muted }}>{item.subtitle}</Text>
            </View>
            <ChevronRight size={14} color={colors.muted} />
          </Pressable>
        ))
      )}
    </View>
  );
}
