import { useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, Linking, Modal, Pressable,
  RefreshControl, ScrollView, Share, Switch, Text, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowLeft, Users, FileCheck, FileText, Send, MapPin, Briefcase,
  Plus, X, Check, Phone, Mail,
} from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import { useActiveBusiness } from "@/lib/active-business";
import { colors, radius, space } from "@/lib/theme";
import { useResponsive } from "@/lib/responsive";

interface WorkOrderFull {
  id:               string;
  number:           string;
  title:            string | null;
  status:           string;
  scheduled_date:   string | null;
  share_token:      string | null;
  customer_id:      string | null;
  customers:        { id: string; name: string; email: string | null; phone: string | null } | null;
  work_order_assignments: Array<{
    member_profile_id: string;
    member_profiles:   { id: string; name: string; email: string; avatar_url: string | null } | null;
  }>;
}

interface Linked {
  id: string; number: string; status: string; total: unknown;
  amount_paid?: unknown; due_date?: string | null;
}

interface MemberLite {
  id: string; name: string; email: string; avatar_url: string | null;
}

const num = (v: unknown) => { const n = typeof v === "number" ? v : parseFloat(String(v ?? 0)); return Number.isFinite(n) ? n : 0; };
function fmt(n: number, currency: string): string {
  try { return new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(n); }
  catch { return `${currency} ${n.toFixed(2)}`; }
}

/** Owner / admin work-order portfolio. Workers picker, linked
 *  financials, share link toggle. The worker-flavoured /job/[id]
 *  stays as the field UI; this is the ops view. */
export default function WorkOrderPortfolio() {
  const router = useRouter();
  const r = useResponsive();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { active, role } = useActiveBusiness();
  const canEdit = role === "owner" || role === "admin" || role === "editor";

  const [wo,         setWo]         = useState<WorkOrderFull | null>(null);
  const [quotes,     setQuotes]     = useState<Linked[]>([]);
  const [invoices,   setInvoices]   = useState<Linked[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy,       setBusy]       = useState(false);

  const currency = active?.currency ?? "AUD";

  const load = async () => {
    if (!id || !active) return;
    const [{ data: woRaw }, { data: qts }, { data: invs }] = await Promise.all([
      supabase.from("work_orders")
        .select("id, number, title, status, scheduled_date, share_token, customer_id, customers(id, name, email, phone), work_order_assignments(member_profile_id, member_profiles(id, name, email, avatar_url))")
        .eq("id", id).eq("business_id", active.id).maybeSingle(),
      supabase.from("quotes")
        .select("id, number, status, total")
        .eq("business_id", active.id).eq("work_order_id", id)
        .order("created_at", { ascending: false }),
      supabase.from("invoices")
        .select("id, number, status, total, amount_paid, due_date")
        .eq("business_id", active.id).eq("work_order_id", id)
        .order("created_at", { ascending: false }),
    ]);
    setWo((woRaw ?? null) as unknown as WorkOrderFull | null);
    setQuotes((qts ?? []) as Linked[]);
    setInvoices((invs ?? []) as Linked[]);
  };

  useEffect(() => { load(); }, [id, active?.id]);

  const toggleShare = async (next: boolean) => {
    if (!wo || !canEdit) return;
    setBusy(true);
    if (next) {
      const token = wo.share_token ?? "wo_" + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
      await supabase.from("work_orders").update({ share_token: token, share_enabled_at: new Date().toISOString() }).eq("id", wo.id);
    } else {
      await supabase.from("work_orders").update({ share_token: null, share_enabled_at: null }).eq("id", wo.id);
    }
    setBusy(false);
    load();
  };

  const shareLink = async () => {
    if (!wo?.share_token) return;
    const base = process.env.EXPO_PUBLIC_APP_URL ?? "https://kireihq.com";
    const url = `${base}/wo/${wo.share_token}`;
    await Share.share({
      message: `Job ${wo.number}${wo.title ? ` — ${wo.title}` : ""}: ${url}`,
      url, title: `Job ${wo.number}`,
    });
  };

  /** Mint a draft invoice prefilled with this WO's customer; the WO is linked
   *  via work_order_id so it shows up on the portfolio. */
  const billUnbilled = async () => {
    if (!wo || !active || !wo.customer_id) {
      Alert.alert("Customer required", "Attach a customer to the work order first.");
      return;
    }
    setBusy(true);
    try {
      const { data: biz } = await supabase
        .from("businesses").select("invoice_prefix, invoice_next_number")
        .eq("id", active.id).single();
      const prefix = (biz as { invoice_prefix?: string; invoice_next_number?: number })?.invoice_prefix ?? "INV";
      const nextNum = (biz as { invoice_prefix?: string; invoice_next_number?: number })?.invoice_next_number ?? 1;
      const number = `${prefix}-${String(nextNum).padStart(4, "0")}`;
      await supabase.from("businesses").update({ invoice_next_number: nextNum + 1 }).eq("id", active.id);

      const { data: { user } } = await supabase.auth.getUser();
      const today = new Date().toISOString().split("T")[0];
      const due = new Date(Date.now() + 14 * 86_400_000).toISOString().split("T")[0];

      const { data: created, error } = await supabase
        .from("invoices")
        .insert({
          user_id: user?.id, business_id: active.id, number,
          status: "draft", customer_id: wo.customer_id,
          work_order_id: wo.id,
          issue_date: today, due_date: due,
          line_items: [],
          subtotal: 0, tax_total: 0, total: 0, amount_paid: 0,
        })
        .select("id").single();
      if (error) throw error;
      router.push(`/invoices/${(created as { id: string }).id}` as never);
    } catch (e) {
      Alert.alert("Couldn't create invoice", e instanceof Error ? e.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  };

  if (!wo) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  const assigned = (wo.work_order_assignments ?? [])
    .map((a) => a.member_profiles)
    .filter((m): m is MemberLite => !!m);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["top", "left", "right"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.sm, gap: space.sm }}>
        <Pressable onPress={() => router.back()} hitSlop={10}><ArrowLeft size={22} color={colors.text} /></Pressable>
        <Briefcase size={18} color={colors.text} />
        <Text style={{ flex: 1, fontSize: 18, fontWeight: "700", color: colors.text }} numberOfLines={1}>{wo.number}</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: space.lg, gap: space.md , ...r.containerStyle }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.primary} />}
      >
        {/* Header card */}
        <View style={{ padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.hairline, gap: 6 }}>
          <Text style={{ fontSize: 11, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: "700" }}>{wo.status}</Text>
          <Text style={{ fontSize: 18, fontWeight: "700", color: colors.text }}>{wo.title ?? "Untitled"}</Text>
          {wo.customers && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
              <Pressable onPress={() => router.push(`/customers/${wo.customers!.id}` as never)}
                style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <MapPin size={13} color={colors.muted} />
                <Text style={{ fontSize: 13, color: colors.primary, fontWeight: "600" }}>{wo.customers.name}</Text>
              </Pressable>
              {wo.customers.phone && (
                <Pressable onPress={() => Linking.openURL(`tel:${wo.customers!.phone!.replace(/\s/g, "")}`)}
                  hitSlop={6}
                  style={({ pressed }) => ({
                    flexDirection: "row", alignItems: "center", gap: 4,
                    paddingHorizontal: 8, paddingVertical: 3,
                    borderRadius: radius.pill,
                    backgroundColor: pressed ? colors.muted + "33" : colors.primarySoft,
                  })}>
                  <Phone size={11} color={colors.primaryText} />
                  <Text style={{ fontSize: 12, color: colors.primaryText, fontWeight: "600" }}>{wo.customers.phone}</Text>
                </Pressable>
              )}
            </View>
          )}
          {wo.scheduled_date && (
            <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>Scheduled {new Date(wo.scheduled_date).toLocaleDateString()}</Text>
          )}
          <Pressable onPress={() => router.push(`/job/${wo.id}` as never)}
            style={({ pressed }) => ({ marginTop: space.sm, paddingVertical: 6, opacity: pressed ? 0.6 : 1 })}>
            <Text style={{ fontSize: 12, color: colors.primary, fontWeight: "700" }}>Open field view →</Text>
          </Pressable>
        </View>

        {/* Workers */}
        <View style={{ padding: space.md, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.hairline, gap: space.sm }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Users size={14} color={colors.muted} />
            <Text style={{ flex: 1, marginLeft: 6, fontSize: 11, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: "700" }}>
              Workers · {assigned.length}
            </Text>
            {canEdit && (
              <Pressable onPress={() => setPickerOpen(true)} hitSlop={8}
                style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 4, opacity: pressed ? 0.7 : 1 })}>
                <Plus size={14} color={colors.primary} />
                <Text style={{ fontSize: 12, color: colors.primary, fontWeight: "700" }}>Edit</Text>
              </Pressable>
            )}
          </View>
          {assigned.length === 0 ? (
            <Text style={{ fontSize: 12, color: colors.muted }}>No one assigned yet.</Text>
          ) : assigned.map((m) => (
            <View key={m.id} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.muted + "33", alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontSize: 12, fontWeight: "700", color: colors.text }}>{m.name.slice(0, 1).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: colors.text }}>{m.name}</Text>
                <Text style={{ fontSize: 11, color: colors.muted }}>{m.email}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Financials */}
        <View style={{ padding: space.md, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.hairline, gap: space.sm }}>
          <Text style={{ fontSize: 11, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: "700" }}>Financials</Text>

          {quotes.length === 0 && invoices.length === 0 ? (
            <Text style={{ fontSize: 12, color: colors.muted }}>No quotes or invoices linked.</Text>
          ) : (
            <>
              {quotes.map((q) => (
                <Pressable key={q.id} onPress={() => router.push(`/quotes/${q.id}` as never)}
                  style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", paddingVertical: 6, opacity: pressed ? 0.6 : 1 })}>
                  <FileCheck size={14} color="#7c3aed" />
                  <Text style={{ marginLeft: 8, flex: 1, fontSize: 13, color: colors.text }}>{q.number}</Text>
                  <Text style={{ fontSize: 11, color: colors.muted, marginRight: 8 }}>{q.status}</Text>
                  <Text style={{ fontSize: 13, fontWeight: "700", color: colors.text }}>{fmt(num(q.total), currency)}</Text>
                </Pressable>
              ))}
              {invoices.map((inv) => {
                const balance = Math.max(0, num(inv.total) - num(inv.amount_paid));
                return (
                  <Pressable key={inv.id} onPress={() => router.push(`/invoices/${inv.id}` as never)}
                    style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", paddingVertical: 6, opacity: pressed ? 0.6 : 1 })}>
                    <FileText size={14} color="#16a34a" />
                    <Text style={{ marginLeft: 8, flex: 1, fontSize: 13, color: colors.text }}>{inv.number}</Text>
                    <Text style={{ fontSize: 11, color: colors.muted, marginRight: 8 }}>
                      {balance > 0 ? `${fmt(balance, currency)} due` : "paid"}
                    </Text>
                    <Text style={{ fontSize: 13, fontWeight: "700", color: colors.text }}>{fmt(num(inv.total), currency)}</Text>
                  </Pressable>
                );
              })}
            </>
          )}

          {canEdit && (
            <Pressable onPress={billUnbilled} disabled={busy}
              style={({ pressed }) => ({
                flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
                paddingVertical: 8, borderRadius: radius.md,
                backgroundColor: pressed ? colors.muted : "transparent",
                borderWidth: 1, borderColor: colors.hairline, borderStyle: "dashed",
                opacity: busy ? 0.6 : 1, marginTop: 4,
              })}>
              <Plus size={14} color={colors.primary} />
              <Text style={{ fontSize: 12, fontWeight: "700", color: colors.primary }}>Create invoice for this job</Text>
            </Pressable>
          )}
        </View>

        {/* Share link */}
        {canEdit && (
          <View style={{ padding: space.md, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.hairline, gap: space.sm }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Send size={14} color={colors.muted} />
              <Text style={{ flex: 1, marginLeft: 6, fontSize: 11, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: "700" }}>
                Share link
              </Text>
              <Switch
                value={!!wo.share_token}
                onValueChange={toggleShare}
                disabled={busy}
                trackColor={{ true: colors.primary, false: colors.muted + "55" }}
              />
            </View>
            <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 18 }}>
              Customer can see job status, photos, and signed updates without logging in.
            </Text>
            {wo.share_token && (
              <Pressable onPress={shareLink}
                style={({ pressed }) => ({
                  flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
                  padding: space.sm + 2, borderRadius: radius.md,
                  backgroundColor: pressed ? "#0d6e6a" : colors.primary,
                })}>
                <Send size={14} color="#fff" />
                <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}>Share with customer</Text>
              </Pressable>
            )}
          </View>
        )}

        {/* Quick contact */}
        {wo.customers && (wo.customers.phone || wo.customers.email) && (
          <View style={{ flexDirection: "row", gap: space.sm }}>
            {wo.customers.phone && (
              <Pressable onPress={() => Linking.openURL(`tel:${wo.customers!.phone!.replace(/\s/g, "")}`)}
                style={({ pressed }) => ({
                  flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
                  padding: space.md, borderRadius: radius.lg,
                  backgroundColor: pressed ? "#0d4a47" : colors.primary,
                })}>
                <Phone size={16} color="#fff" />
                <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}>Call</Text>
              </Pressable>
            )}
            {wo.customers.email && (
              <Pressable onPress={() => Linking.openURL(`mailto:${wo.customers!.email}`)}
                style={({ pressed }) => ({
                  flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
                  padding: space.md, borderRadius: radius.lg,
                  backgroundColor: pressed ? "#1e3a8a" : "#1d4ed8",
                })}>
                <Mail size={16} color="#fff" />
                <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}>Email</Text>
              </Pressable>
            )}
          </View>
        )}
      </ScrollView>

      {pickerOpen && active && (
        <WorkerPickerModal
          businessId={active.id}
          workOrderId={wo.id}
          currentlyAssigned={(wo.work_order_assignments ?? []).map((a) => a.member_profile_id)}
          onClose={() => { setPickerOpen(false); load(); }}
        />
      )}
    </SafeAreaView>
  );
}

function WorkerPickerModal({ businessId, workOrderId, currentlyAssigned, onClose }: {
  businessId: string; workOrderId: string;
  currentlyAssigned: string[];
  onClose: () => void;
}) {
  const [members, setMembers] = useState<MemberLite[]>([]);
  const [picked,  setPicked]  = useState<Set<string>>(new Set(currentlyAssigned));
  const [saving,  setSaving]  = useState(false);

  useEffect(() => {
    supabase.from("member_profiles")
      .select("id, name, email, avatar_url")
      .eq("business_id", businessId).eq("is_active", true)
      .order("name", { ascending: true })
      .then(({ data }) => setMembers((data ?? []) as MemberLite[]));
  }, [businessId]);

  const save = async () => {
    setSaving(true);
    // Wipe + reinsert — simpler than diffing
    await supabase.from("work_order_assignments").delete().eq("work_order_id", workOrderId);
    if (picked.size > 0) {
      const rows = Array.from(picked).map((mpId) => ({
        work_order_id: workOrderId, member_profile_id: mpId,
      }));
      await supabase.from("work_order_assignments").insert(rows);
    }
    setSaving(false);
    onClose();
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>
        <View style={{ flex: 1, padding: space.lg }}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: space.md }}>
            <Text style={{ flex: 1, fontSize: 18, fontWeight: "700", color: colors.text }}>Assign workers</Text>
            <Pressable onPress={onClose} hitSlop={8}><X size={22} color={colors.text} /></Pressable>
          </View>
          <FlatList
            data={members}
            keyExtractor={(m) => m.id}
            ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: colors.hairline }} />}
            ListEmptyComponent={<Text style={{ color: colors.muted, textAlign: "center", marginTop: space.xl }}>No team members yet. Add some in Settings → Team.</Text>}
            renderItem={({ item }) => {
              const selected = picked.has(item.id);
              return (
                <Pressable
                  onPress={() => {
                    const next = new Set(picked);
                    if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
                    setPicked(next);
                  }}
                  style={({ pressed }) => ({
                    flexDirection: "row", alignItems: "center", gap: space.sm,
                    paddingVertical: space.md,
                    opacity: pressed ? 0.6 : 1,
                  })}>
                  <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.muted + "33", alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontSize: 12, fontWeight: "700", color: colors.text }}>{item.name.slice(0, 1).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: "600", color: colors.text }}>{item.name}</Text>
                    <Text style={{ fontSize: 12, color: colors.muted }}>{item.email}</Text>
                  </View>
                  {selected && <Check size={18} color={colors.primary} />}
                </Pressable>
              );
            }}
          />
          <Pressable onPress={save} disabled={saving}
            style={({ pressed }) => ({
              flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
              padding: space.md, borderRadius: radius.lg,
              backgroundColor: pressed ? "#0d6e6a" : colors.primary,
              opacity: saving ? 0.6 : 1,
            })}>
            <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>{saving ? "Saving…" : `Save (${picked.size})`}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}
