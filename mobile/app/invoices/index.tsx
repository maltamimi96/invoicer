import { useEffect, useState, useMemo } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { ArrowLeft, Plus, FileText } from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import { useActiveBusiness } from "@/lib/active-business";
import { colors, radius, space } from "@/lib/theme";
import { StatusPill } from "@/components/StatusPill";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonRow } from "@/components/Skeleton";
import { BrandedRefresh } from "@/components/BrandedRefresh";
import { FadeIn } from "@/components/FadeIn";

interface InvoiceRow {
  id: string;
  number: string;
  status: "draft" | "sent" | "partial" | "paid" | "overdue" | "cancelled";
  total: unknown;
  amount_paid: unknown;
  due_date: string | null;
  issue_date: string | null;
  customers: { name: string } | null;
}

const STATUS_COLOUR: Record<InvoiceRow["status"], { bg: string; fg: string }> = {
  draft:     { bg: "#fef3c7", fg: "#92400e" },
  sent:      { bg: "#dbeafe", fg: "#1d4ed8" },
  partial:   { bg: "#fef3c7", fg: "#92400e" },
  paid:      { bg: "#dcfce7", fg: "#166534" },
  overdue:   { bg: "#fee2e2", fg: "#991b1b" },
  cancelled: { bg: "#e5e7eb", fg: "#374151" },
};

const TABS: Array<{ id: "all" | InvoiceRow["status"]; label: string }> = [
  { id: "all", label: "All" },
  { id: "sent", label: "Sent" },
  { id: "overdue", label: "Overdue" },
  { id: "paid", label: "Paid" },
  { id: "draft", label: "Draft" },
];

const num = (v: unknown) => { const n = typeof v === "number" ? v : parseFloat(String(v ?? 0)); return Number.isFinite(n) ? n : 0; };
function fmtMoney(n: number, currency: string): string {
  try { return new Intl.NumberFormat("en-AU", { style: "currency", currency, maximumFractionDigits: 0 }).format(n); }
  catch { return `${currency} ${n.toFixed(0)}`; }
}

export default function InvoicesList() {
  const router = useRouter();
  const { active } = useActiveBusiness();
  const [invoices, setInvoices] = useState<InvoiceRow[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<typeof TABS[number]["id"]>("all");

  const currency = active?.currency ?? "AUD";

  const load = async () => {
    if (!active) return;
    const { data } = await supabase
      .from("invoices")
      .select("id, number, status, total, amount_paid, due_date, issue_date, customers(name)")
      .eq("business_id", active.id)
      .order("created_at", { ascending: false }).limit(100);
    setInvoices((data ?? []) as unknown as InvoiceRow[]);
  };

  useEffect(() => { load(); }, [active?.id]);

  const filtered = useMemo(() => {
    if (!invoices) return null;
    if (tab === "all") return invoices;
    if (tab === "overdue") {
      const today = new Date().toISOString().split("T")[0];
      return invoices.filter((i) => ["sent", "partial"].includes(i.status) && i.due_date && i.due_date < today);
    }
    return invoices.filter((i) => i.status === tab);
  }, [invoices, tab]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["top", "left", "right"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.sm, gap: space.sm }}>
        <Pressable onPress={() => router.back()} hitSlop={10}><ArrowLeft size={22} color={colors.text} /></Pressable>
        <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text }}>Invoices</Text>
        <View style={{ flex: 1 }} />
        <Text style={{ fontSize: 12, color: colors.muted }}>{invoices?.length ?? 0}</Text>
        <Pressable onPress={() => router.push("/invoices/new" as never)} hitSlop={8}
          style={({ pressed }) => ({ padding: 6, borderRadius: 999, backgroundColor: pressed ? colors.muted : colors.primary })}>
          <Plus size={18} color="#fff" />
        </Pressable>
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
      {invoices === null ? (
        <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm, gap: 8 }}>
          {Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)}
        </View>
      ) : filtered!.length === 0 ? (
        <EmptyState
          icon={<FileText size={32} color="#fff" />}
          title="No invoices in this view"
          subtitle="Send your first one to start collecting payment."
          ctaLabel="New invoice"
          onPressCta={() => router.push("/invoices/new" as never)}
          gradient="emerald"
        />
      ) : (
        <FlatList
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={7}
          removeClippedSubviews
          data={filtered!}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xxl }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          refreshControl={<BrandedRefresh refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
          renderItem={({ item, index }) => {
            const balance = Math.max(0, num(item.total) - num(item.amount_paid));
            const today = new Date().toISOString().split("T")[0];
            const isOverdue = ["sent", "partial"].includes(item.status) && item.due_date && item.due_date < today;
            const tone = isOverdue ? "overdue" : item.status;
            return (
              <FadeIn delay={Math.min(index * 30, 240)}>
                <Pressable
                  onPress={() => router.push(`/invoices/${item.id}` as never)}
                  style={({ pressed }) => ({
                    padding: space.md, borderRadius: radius.lg,
                    backgroundColor: pressed ? colors.muted : colors.card,
                    borderWidth: 1, borderColor: colors.hairline, gap: 6,
                  })}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={{ fontFamily: "monospace", fontSize: 12, color: colors.muted }}>{item.number}</Text>
                    <StatusPill tone={tone} />
                  </View>
                  <Text style={{ fontSize: 15, fontWeight: "700", color: colors.text }}>{item.customers?.name ?? "No customer"}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <Text style={{ fontSize: 11, color: colors.muted }}>
                      {item.issue_date ?? "—"}{item.due_date ? ` · due ${item.due_date}` : ""}
                    </Text>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={{ fontSize: 16, fontWeight: "800", color: colors.text, letterSpacing: -0.4 }}>{fmtMoney(num(item.total), currency)}</Text>
                      {balance > 0 && balance < num(item.total) && (
                        <Text style={{ fontSize: 11, color: "#dc2626", fontWeight: "700" }}>{fmtMoney(balance, currency)} due</Text>
                      )}
                    </View>
                  </View>
                </Pressable>
              </FadeIn>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}
