import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Text, TextInput, View, Linking, Share } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Send, Copy, MessageSquare, Mail, RotateCcw, DollarSign, CheckCircle, Wallet } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { supabase } from "@/lib/supabase";
import { useActiveBusiness } from "@/lib/active-business";
import { colors, gradients, radius, space } from "@/lib/theme";
import { useResponsive } from "@/lib/responsive";
import { StatusPill } from "@/components/StatusPill";
import { FadeIn } from "@/components/FadeIn";
import { PatternBackground } from "@/components/PatternBackground";
import { Confetti } from "@/components/Confetti";

interface LineItem {
  id: string; name: string; description?: string;
  quantity: number; unit_price: number; total: number; tax_rate: number;
}

interface InvoiceFull {
  id: string;
  number: string;
  status: "draft" | "sent" | "partial" | "paid" | "overdue" | "cancelled";
  customer_id: string | null;
  issue_date: string | null;
  due_date: string | null;
  line_items: LineItem[] | null;
  subtotal: unknown;
  tax_total: unknown;
  total: unknown;
  amount_paid: unknown;
  notes: string | null;
  terms: string | null;
  customers: { id: string; name: string; email: string | null; phone: string | null } | null;
}

const STATUS_COLOUR: Record<InvoiceFull["status"], { bg: string; fg: string }> = {
  draft:     { bg: "#fef3c7", fg: "#92400e" },
  sent:      { bg: "#dbeafe", fg: "#1d4ed8" },
  partial:   { bg: "#fef3c7", fg: "#92400e" },
  paid:      { bg: "#dcfce7", fg: "#166534" },
  overdue:   { bg: "#fee2e2", fg: "#991b1b" },
  cancelled: { bg: "#e5e7eb", fg: "#374151" },
};

const num = (v: unknown) => { const n = typeof v === "number" ? v : parseFloat(String(v ?? 0)); return Number.isFinite(n) ? n : 0; };
function fmtMoney(n: number, currency: string): string {
  try { return new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(n); } catch { return `${currency} ${n.toFixed(2)}`; }
}
function cryptoHex(byteLen: number): string {
  let out = ""; for (let i = 0; i < byteLen * 2; i++) out += "0123456789abcdef"[Math.floor(Math.random() * 16)]; return out;
}

export default function InvoiceDetail() {
  const router = useRouter();
  const r = useResponsive();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { active } = useActiveBusiness();
  const [invoice, setInvoice] = useState<InvoiceFull | null>(null);
  const [busy, setBusy] = useState(false);
  const [confettiKey, setConfettiKey] = useState(0);
  const [paymentOpen, setPaymentOpen] = useState(false);

  const currency = active?.currency ?? "AUD";

  const load = async () => {
    if (!id || !active) return;
    const { data } = await supabase
      .from("invoices")
      .select("*, customers(id, name, email, phone)")
      .eq("id", id)
      .eq("business_id", active.id)
      .maybeSingle();
    setInvoice(data as unknown as InvoiceFull);
  };

  useEffect(() => { load(); }, [id, active?.id]);

  const setStatus = async (status: InvoiceFull["status"]) => {
    if (!invoice) return;
    const wasPaid = invoice.status === "paid";
    setBusy(true);
    await supabase.from("invoices").update({ status }).eq("id", invoice.id);
    setInvoice({ ...invoice, status });
    if (status === "paid" && !wasPaid) setConfettiKey((k) => k + 1);
    setBusy(false);
  };

  const recordPayment = async (amount: number, method: string) => {
    if (!invoice || !active || amount <= 0) return;
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const newAmountPaid = num(invoice.amount_paid) + amount;
      const newStatus = newAmountPaid >= num(invoice.total) - 0.01 ? "paid" : "partial";

      await supabase.from("payments").insert({
        invoice_id: invoice.id, user_id: user?.id, business_id: active.id,
        amount, date: new Date().toISOString().split("T")[0], method,
      });
      await supabase.from("invoices").update({ amount_paid: newAmountPaid, status: newStatus }).eq("id", invoice.id);

      if (newStatus === "paid" && invoice.status !== "paid") setConfettiKey((k) => k + 1);
      Alert.alert("Payment recorded", `${fmtMoney(amount, currency)} marked as ${method}`);
      setPaymentOpen(false);
      load();
    } catch (e) {
      Alert.alert("Couldn't record payment", e instanceof Error ? e.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  };

  const duplicate = async () => {
    if (!invoice || !active) return;
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
      const { data: created, error } = await supabase
        .from("invoices")
        .insert({
          user_id: user?.id, business_id: active.id, number,
          status: "draft", customer_id: invoice.customer_id,
          issue_date: today, due_date: invoice.due_date,
          line_items: invoice.line_items,
          subtotal: invoice.subtotal, tax_total: invoice.tax_total, total: invoice.total,
          amount_paid: 0, notes: invoice.notes, terms: invoice.terms,
          parent_invoice_id: null,
        })
        .select("id").single();
      if (error) throw error;
      Alert.alert("Invoice duplicated", `Created ${number}`);
      router.replace(`/invoices/${(created as { id: string }).id}` as never);
    } catch (e) {
      Alert.alert("Couldn't duplicate", e instanceof Error ? e.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  };

  /** Bill a deposit / progress payment — mints a child invoice for X%
   *  of this parent's total, linked back via parent_invoice_id.
   *  Mirrors web createProgressInvoice. */
  const billProgress = async (percent: number) => {
    if (!invoice || !active) return;
    setBusy(true);
    try {
      // Children billed so far → compute remaining
      const { data: children } = await supabase
        .from("invoices").select("total")
        .eq("parent_invoice_id", invoice.id)
        .eq("business_id", active.id);
      const billed = ((children ?? []) as Array<{ total: unknown }>)
        .reduce((s, c) => s + num(c.total), 0);
      const parentTotal = num(invoice.total);
      const remaining = Math.max(0, parentTotal - billed);
      const requested = Math.round((parentTotal * percent) / 100 * 100) / 100;
      if (requested <= 0) { Alert.alert("Nothing to bill", "Pick a non-zero percentage."); return; }
      if (requested > remaining + 0.01) {
        Alert.alert("Too much", `Only ${fmtMoney(remaining, currency)} left to bill on ${invoice.number}.`);
        return;
      }

      const { data: biz } = await supabase
        .from("businesses").select("invoice_prefix, invoice_next_number")
        .eq("id", active.id).single();
      const prefix = (biz as { invoice_prefix?: string; invoice_next_number?: number })?.invoice_prefix ?? "INV";
      const nextNum = (biz as { invoice_prefix?: string; invoice_next_number?: number })?.invoice_next_number ?? 1;
      const number = `${prefix}-${String(nextNum).padStart(4, "0")}`;
      await supabase.from("businesses").update({ invoice_next_number: nextNum + 1 }).eq("id", active.id);

      const { data: { user } } = await supabase.auth.getUser();
      const today = new Date().toISOString().split("T")[0];
      const due = invoice.due_date ?? new Date(Date.now() + 14 * 86_400_000).toISOString().split("T")[0];
      const description = Math.abs(requested - remaining) < 0.01
        ? `Final balance for ${invoice.number}`
        : `${percent}% progress payment on ${invoice.number}`;

      const { data: created, error } = await supabase
        .from("invoices")
        .insert({
          user_id: user?.id, business_id: active.id, number,
          status: "draft",
          customer_id: invoice.customer_id,
          issue_date: today, due_date: due,
          line_items: [{
            id: Math.random().toString(36).slice(2),
            name: description, description: "",
            quantity: 1, unit_price: requested, tax_rate: 0,
            total: requested,
          }],
          subtotal: requested, tax_total: 0, total: requested,
          amount_paid: 0,
          notes: null, terms: null,
          parent_invoice_id: invoice.id,
        })
        .select("id").single();
      if (error) throw error;
      Alert.alert("Deposit invoice created", `${number} for ${fmtMoney(requested, currency)}`);
      router.replace(`/invoices/${(created as { id: string }).id}` as never);
    } catch (e) {
      Alert.alert("Couldn't bill deposit", e instanceof Error ? e.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  };

  const askForDeposit = () => {
    Alert.alert("Bill a deposit / progress payment",
      "Mints a child invoice linked to this one.",
      [
        { text: "25%", onPress: () => billProgress(25) },
        { text: "30%", onPress: () => billProgress(30) },
        { text: "50%", onPress: () => billProgress(50) },
        { text: "Cancel", style: "cancel" },
      ]);
  };

  const shareLink = async () => {
    if (!invoice || !active || !invoice.customer_id) return;
    setBusy(true);
    try {
      const { data: existing } = await supabase
        .from("customer_portal_tokens")
        .select("token")
        .eq("business_id", active.id)
        .eq("customer_id", invoice.customer_id)
        .is("revoked_at", null)
        .or("expires_at.is.null,expires_at.gt." + new Date().toISOString())
        .limit(1).maybeSingle();
      let token = (existing as { token?: string } | null)?.token;
      if (!token) {
        token = "cust_" + cryptoHex(48);
        const { data: { user } } = await supabase.auth.getUser();
        await supabase.from("customer_portal_tokens").insert({
          token, business_id: active.id, customer_id: invoice.customer_id,
          created_by: user?.id, expires_at: new Date(Date.now() + 90 * 86_400_000).toISOString(),
        });
      }
      const base = process.env.EXPO_PUBLIC_APP_URL ?? "https://kireihq.com";
      const url = `${base}/portal/${token}/invoice/${invoice.id}`;
      const balance = Math.max(0, num(invoice.total) - num(invoice.amount_paid));
      await Share.share({
        message: `Hi${invoice.customers?.name ? " " + invoice.customers.name.split(" ")[0] : ""}, your invoice ${invoice.number} is ready. ${balance > 0 ? `Amount due: ${fmtMoney(balance, currency)}. ` : ""}View & pay: ${url}`,
        url, title: `Invoice ${invoice.number}`,
      });
    } catch (e) {
      Alert.alert("Couldn't share", e instanceof Error ? e.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  };

  if (!invoice) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  const balance = Math.max(0, num(invoice.total) - num(invoice.amount_paid));
  const items = invoice.line_items ?? [];
  const heroPalette = invoice.status === "paid"      ? gradients.emerald
                    : invoice.status === "overdue"   ? gradients.rose
                    : invoice.status === "partial"   ? gradients.amber
                    : invoice.status === "cancelled" ? gradients.softRose
                    : invoice.status === "draft"     ? gradients.dusk
                    :                                  gradients.primary;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["top", "left", "right"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.sm, gap: space.sm }}>
        <Pressable onPress={() => router.back()} hitSlop={10}><ArrowLeft size={22} color={colors.text} /></Pressable>
        <Text style={{ fontSize: 14, color: colors.muted }}>Invoice</Text>
        <View style={{ flex: 1 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: space.xxl , ...r.containerStyle }}>
        {/* Hero — gradient billed-to + total */}
        <FadeIn>
          <View style={{ borderRadius: radius.xxl, overflow: "hidden" }}>
            <LinearGradient
              colors={heroPalette as unknown as readonly [string, string, ...string[]]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={{ padding: space.lg + 4, gap: 6, minHeight: 150 }}
            >
              <PatternBackground variant="dots" color="#fff" opacity={0.13} />
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm }}>
                <Text style={{ fontFamily: "monospace", fontSize: 12, color: "rgba(255,255,255,0.85)", letterSpacing: 1 }}>{invoice.number}</Text>
                <StatusPill tone={invoice.status} />
              </View>
              <Text style={{ fontSize: 11, color: "rgba(255,255,255,0.85)", textTransform: "uppercase", letterSpacing: 1.4, fontWeight: "700", marginTop: 6 }}>Billed to</Text>
              <Text style={{ fontSize: 18, fontWeight: "700", color: "#fff" }} numberOfLines={1}>{invoice.customers?.name ?? "No customer"}</Text>
              <Text style={{ fontSize: 32, fontWeight: "800", color: "#fff", letterSpacing: -0.6, marginTop: 6 }}>{fmtMoney(num(invoice.total), currency)}</Text>
              {num(invoice.amount_paid) > 0 && (
                <View style={{ marginTop: 6, flexDirection: "row", gap: space.md, alignItems: "baseline" }}>
                  <Text style={{ fontSize: 13, color: "rgba(255,255,255,0.95)" }}>Paid {fmtMoney(num(invoice.amount_paid), currency)}</Text>
                  {balance > 0 && (
                    <Text style={{ fontSize: 14, fontWeight: "800", color: "#fff" }}>Due {fmtMoney(balance, currency)}</Text>
                  )}
                </View>
              )}
            </LinearGradient>
          </View>
        </FadeIn>

        {/* Quick actions */}
        <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
          {invoice.customer_id && (
            <BigBtn icon={<Send size={16} color="#fff" />} label="Share link" bg={colors.primary} onPress={shareLink} disabled={busy} />
          )}
          {balance > 0 && invoice.status !== "paid" && invoice.status !== "cancelled" && (
            <BigBtn icon={<DollarSign size={16} color="#fff" />} label="Mark paid" bg="#16a34a" onPress={() => setPaymentOpen(true)} disabled={busy} />
          )}
          {invoice.customers?.phone && (
            <BigBtn icon={<MessageSquare size={16} color="#fff" />} label="SMS" bg="#0f766e" onPress={() => Linking.openURL(`sms:${invoice.customers!.phone!.replace(/\s/g, "")}`)} />
          )}
          {invoice.customers?.email && (
            <BigBtn icon={<Mail size={16} color="#fff" />} label="Email" bg="#1d4ed8" onPress={() => Linking.openURL(`mailto:${invoice.customers!.email!}`)} />
          )}
        </View>

        {/* Status + dup + deposit */}
        <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
          <SmallBtn icon={<RotateCcw size={14} color={colors.text} />} label="Reset to draft" onPress={() => setStatus("draft")} disabled={busy || invoice.status === "draft"} />
          <SmallBtn icon={<Copy size={14} color={colors.text} />} label="Duplicate" onPress={duplicate} disabled={busy} />
          <SmallBtn icon={<Wallet size={14} color={colors.text} />} label="Bill deposit" onPress={askForDeposit} disabled={busy} />
        </View>

        {/* Status changer */}
        <View style={{ padding: space.md, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.hairline, gap: space.sm }}>
          <Text style={{ fontSize: 11, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: "700" }}>Status</Text>
          <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
            {(["draft", "sent", "paid", "cancelled"] as const).map((s) => {
              const sc = STATUS_COLOUR[s];
              const selected = s === invoice.status;
              return (
                <Pressable key={s} onPress={() => setStatus(s)} disabled={busy || selected}
                  style={({ pressed }) => ({
                    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
                    backgroundColor: selected ? sc.bg : pressed ? colors.muted : "transparent",
                    borderWidth: 1, borderColor: selected ? sc.bg : colors.hairline,
                  })}>
                  <Text style={{ fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6, color: selected ? sc.fg : colors.muted }}>{s}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Line items */}
        <View style={{ borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.hairline, overflow: "hidden" }}>
          <View style={{ paddingHorizontal: space.md, paddingTop: space.md, paddingBottom: 8 }}>
            <Text style={{ fontSize: 11, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: "700" }}>Line items</Text>
          </View>
          {items.length === 0 ? (
            <View style={{ padding: space.md }}>
              <Text style={{ fontSize: 13, color: colors.muted }}>No line items</Text>
            </View>
          ) : items.map((li) => (
            <View key={li.id} style={{ paddingHorizontal: space.md, paddingVertical: space.sm, borderTopWidth: 1, borderTopColor: colors.hairline }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.sm }}>
                <Text style={{ flex: 1, fontSize: 14, fontWeight: "600", color: colors.text }}>{li.name}</Text>
                <Text style={{ fontSize: 14, fontWeight: "700", color: colors.text }}>{fmtMoney(li.total, currency)}</Text>
              </View>
              {li.description ? <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>{li.description}</Text> : null}
              <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>
                {li.quantity} × {fmtMoney(li.unit_price, currency)}{li.tax_rate ? ` · tax ${li.tax_rate}%` : ""}
              </Text>
            </View>
          ))}
        </View>

        {/* Totals */}
        <View style={{ padding: space.md, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.hairline, gap: 4 }}>
          <Row label="Subtotal" value={fmtMoney(num(invoice.subtotal), currency)} />
          {num(invoice.tax_total) > 0 && <Row label="Tax" value={fmtMoney(num(invoice.tax_total), currency)} />}
          <View style={{ borderTopWidth: 1, borderTopColor: colors.hairline, paddingTop: 6, marginTop: 4 }}>
            <Row label="Total" value={fmtMoney(num(invoice.total), currency)} bold />
          </View>
          {num(invoice.amount_paid) > 0 && (
            <>
              <Row label="Paid" value={`-${fmtMoney(num(invoice.amount_paid), currency)}`} />
              <View style={{ borderTopWidth: 1, borderTopColor: colors.hairline, paddingTop: 6, marginTop: 4 }}>
                <Row label="Balance due" value={fmtMoney(balance, currency)} bold />
              </View>
            </>
          )}
        </View>

        {invoice.notes && (
          <View style={{ padding: space.md, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.hairline, gap: 6 }}>
            <Text style={{ fontSize: 11, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: "700" }}>Notes</Text>
            <Text style={{ fontSize: 14, color: colors.text, lineHeight: 20 }}>{invoice.notes}</Text>
          </View>
        )}
      </ScrollView>

      {/* Record-payment modal */}
      <PaymentModal
        open={paymentOpen}
        balance={balance}
        currency={currency}
        onClose={() => setPaymentOpen(false)}
        onSubmit={recordPayment}
        busy={busy}
      />
      {confettiKey > 0 && <Confetti fireKey={confettiKey} />}
    </SafeAreaView>
  );
}

function PaymentModal({ open, balance, currency, onClose, onSubmit, busy }: {
  open: boolean; balance: number; currency: string; onClose: () => void;
  onSubmit: (amount: number, method: string) => void | Promise<void>;
  busy: boolean;
}) {
  const [amount, setAmount] = useState(balance.toFixed(2));
  const [method, setMethod] = useState("bank_transfer");

  useEffect(() => { if (open) setAmount(balance.toFixed(2)); }, [open, balance]);

  return (
    <Modal visible={open} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)" }} onPress={onClose}>
        <View style={{ marginTop: "auto", backgroundColor: colors.card, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: space.lg, gap: space.md }}>
          <Text style={{ fontSize: 17, fontWeight: "700", color: colors.text }}>Record payment</Text>
          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 12, color: colors.muted }}>Amount ({currency})</Text>
            <TextInput
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              style={{
                fontSize: 16, padding: space.md, borderRadius: radius.md,
                backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.hairline, color: colors.text,
              }}
            />
          </View>
          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 12, color: colors.muted }}>Method</Text>
            <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
              {["bank_transfer", "cash", "card", "cheque", "other"].map((m) => (
                <Pressable key={m} onPress={() => setMethod(m)}
                  style={({ pressed }) => ({
                    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
                    backgroundColor: method === m ? colors.primary : pressed ? colors.muted : "transparent",
                    borderWidth: 1, borderColor: method === m ? colors.primary : colors.hairline,
                  })}>
                  <Text style={{ fontSize: 12, fontWeight: "600", color: method === m ? "#fff" : colors.text, textTransform: "capitalize" }}>
                    {m.replace("_", " ")}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <Pressable onPress={onClose} disabled={busy}
              style={({ pressed }) => ({
                flex: 1, padding: space.md, borderRadius: radius.lg,
                alignItems: "center", backgroundColor: pressed ? colors.muted : colors.canvas,
                borderWidth: 1, borderColor: colors.hairline,
              })}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: colors.text }}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => onSubmit(parseFloat(amount), method)}
              disabled={busy || !amount || parseFloat(amount) <= 0}
              style={({ pressed }) => ({
                flex: 1, padding: space.md, borderRadius: radius.lg, alignItems: "center",
                backgroundColor: pressed ? "#15803d" : "#16a34a", opacity: busy ? 0.6 : 1,
                flexDirection: "row", justifyContent: "center", gap: 6,
              })}>
              <CheckCircle size={16} color="#fff" />
              <Text style={{ fontSize: 14, fontWeight: "700", color: "#fff" }}>Record</Text>
            </Pressable>
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

function BigBtn({ icon, label, bg, onPress, disabled }: { icon: React.ReactNode; label: string; bg: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled}
      style={({ pressed }) => ({
        flex: 1, minWidth: 100,
        flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
        padding: space.md, borderRadius: radius.lg,
        backgroundColor: bg, opacity: pressed || disabled ? 0.7 : 1,
      })}>
      {icon}
      <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}
function SmallBtn({ icon, label, onPress, disabled }: { icon: React.ReactNode; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled}
      style={({ pressed }) => ({
        flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
        padding: space.sm, borderRadius: radius.md,
        backgroundColor: pressed ? colors.muted : colors.card, borderWidth: 1, borderColor: colors.hairline,
        opacity: disabled ? 0.5 : 1,
      })}>
      {icon}
      <Text style={{ fontSize: 12, fontWeight: "600", color: colors.text }}>{label}</Text>
    </Pressable>
  );
}
function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <Text style={{ fontSize: bold ? 14 : 13, color: bold ? colors.text : colors.muted, fontWeight: bold ? "700" : "400" }}>{label}</Text>
      <Text style={{ fontSize: bold ? 16 : 13, color: colors.text, fontWeight: bold ? "700" : "500" }}>{value}</Text>
    </View>
  );
}
