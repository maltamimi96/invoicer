import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View, Linking, Share } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Send, Copy, MessageSquare, Mail, RotateCcw, FileCheck } from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import { useActiveBusiness } from "@/lib/active-business";
import { colors, radius, space } from "@/lib/theme";

interface LineItem {
  id: string; name: string; description?: string;
  quantity: number; unit_price: number; total: number; tax_rate: number;
}

interface QuoteFull {
  id: string;
  number: string;
  status: "draft" | "sent" | "accepted" | "rejected" | "expired";
  customer_id: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  line_items: LineItem[] | null;
  subtotal: unknown;
  tax_total: unknown;
  total: unknown;
  notes: string | null;
  terms: string | null;
  invoice_id: string | null;
  customers: { id: string; name: string; email: string | null; phone: string | null } | null;
}

const STATUS_COLOUR: Record<QuoteFull["status"], { bg: string; fg: string }> = {
  draft:    { bg: "#fef3c7", fg: "#92400e" },
  sent:     { bg: "#dbeafe", fg: "#1d4ed8" },
  accepted: { bg: "#dcfce7", fg: "#166534" },
  rejected: { bg: "#fee2e2", fg: "#991b1b" },
  expired:  { bg: "#e5e7eb", fg: "#374151" },
};

const num = (v: unknown) => { const n = typeof v === "number" ? v : parseFloat(String(v ?? 0)); return Number.isFinite(n) ? n : 0; };
function fmtMoney(n: number, currency: string): string {
  try { return new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(n); } catch { return `${currency} ${n.toFixed(2)}`; }
}

export default function QuoteDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { active } = useActiveBusiness();
  const [quote, setQuote] = useState<QuoteFull | null>(null);
  const [busy, setBusy] = useState(false);

  const currency = active?.currency ?? "AUD";

  const load = async () => {
    if (!id || !active) return;
    const { data } = await supabase
      .from("quotes")
      .select("*, customers(id, name, email, phone)")
      .eq("id", id)
      .eq("business_id", active.id)
      .maybeSingle();
    setQuote(data as unknown as QuoteFull);
  };

  useEffect(() => { load(); }, [id, active?.id]);

  const setStatus = async (status: QuoteFull["status"]) => {
    if (!quote) return;
    setBusy(true);
    await supabase.from("quotes").update({ status }).eq("id", quote.id);
    setQuote({ ...quote, status });
    setBusy(false);
  };

  const duplicate = async () => {
    if (!quote || !active) return;
    setBusy(true);
    try {
      // Mint a fresh quote number from the business prefix counter
      const { data: biz } = await supabase
        .from("businesses").select("quote_prefix, quote_next_number")
        .eq("id", active.id).single();
      const prefix = (biz as { quote_prefix?: string; quote_next_number?: number })?.quote_prefix ?? "QT";
      const nextNum = (biz as { quote_prefix?: string; quote_next_number?: number })?.quote_next_number ?? 1;
      const number = `${prefix}-${String(nextNum).padStart(4, "0")}`;
      await supabase.from("businesses")
        .update({ quote_next_number: nextNum + 1 })
        .eq("id", active.id);

      const { data: { user } } = await supabase.auth.getUser();
      const today = new Date().toISOString().split("T")[0];
      const { data: created, error } = await supabase
        .from("quotes")
        .insert({
          user_id: user?.id, business_id: active.id, number,
          status: "draft",
          customer_id: quote.customer_id,
          issue_date: today,
          expiry_date: quote.expiry_date,
          line_items: quote.line_items,
          subtotal: quote.subtotal, tax_total: quote.tax_total, total: quote.total,
          notes: quote.notes, terms: quote.terms,
          invoice_id: null,
        })
        .select("id").single();
      if (error) throw error;
      Alert.alert("Quote duplicated", `Created ${number}`);
      router.replace(`/quotes/${(created as { id: string }).id}` as never);
    } catch (e) {
      Alert.alert("Couldn't duplicate", e instanceof Error ? e.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  };

  /** Convert this accepted quote into a fresh invoice. Mints a new invoice
   *  number, copies line items + totals + customer, links the two, and routes
   *  to the new invoice. Mirrors web convertQuoteToInvoice. */
  const convertToInvoice = async () => {
    if (!quote || !active) return;
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
          status: "draft",
          customer_id: quote.customer_id,
          issue_date: today, due_date: due,
          line_items: quote.line_items,
          subtotal: quote.subtotal, tax_total: quote.tax_total, total: quote.total,
          amount_paid: 0, notes: quote.notes, terms: quote.terms,
        })
        .select("id").single();
      if (error) throw error;

      // Link the quote → invoice + mark accepted (idempotent if already)
      await supabase.from("quotes")
        .update({ invoice_id: (created as { id: string }).id, status: "accepted" })
        .eq("id", quote.id);

      Alert.alert("Invoice created", `Created ${number} from quote ${quote.number}`);
      router.replace(`/invoices/${(created as { id: string }).id}` as never);
    } catch (e) {
      Alert.alert("Couldn't convert", e instanceof Error ? e.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  };

  const shareLink = async () => {
    if (!quote || !active || !quote.customer_id) return;
    setBusy(true);
    try {
      // Reuse or mint a portal token (90-day) for this customer.
      const { data: existing } = await supabase
        .from("customer_portal_tokens")
        .select("token")
        .eq("business_id", active.id)
        .eq("customer_id", quote.customer_id)
        .is("revoked_at", null)
        .or("expires_at.is.null,expires_at.gt." + new Date().toISOString())
        .limit(1)
        .maybeSingle();
      let token = (existing as { token?: string } | null)?.token;
      if (!token) {
        token = "cust_" + cryptoHex(48);
        const { data: { user } } = await supabase.auth.getUser();
        await supabase.from("customer_portal_tokens").insert({
          token, business_id: active.id, customer_id: quote.customer_id,
          created_by: user?.id, expires_at: new Date(Date.now() + 90 * 86_400_000).toISOString(),
        });
      }
      const base = process.env.EXPO_PUBLIC_APP_URL ?? "https://kireihq.com";
      const url = `${base}/portal/${token}/quote/${quote.id}`;
      await Share.share({
        message: `Hi${quote.customers?.name ? " " + quote.customers.name.split(" ")[0] : ""}, your quote ${quote.number} is ready: ${url}`,
        url, title: `Quote ${quote.number}`,
      });
    } catch (e) {
      Alert.alert("Couldn't share", e instanceof Error ? e.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  };

  if (!quote) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  const c = STATUS_COLOUR[quote.status];
  const items = quote.line_items ?? [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["top", "left", "right"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.sm, gap: space.sm }}>
        <Pressable onPress={() => router.back()} hitSlop={10}><ArrowLeft size={22} color={colors.text} /></Pressable>
        <Text style={{ fontFamily: "monospace", fontSize: 14, color: colors.muted }}>{quote.number}</Text>
        <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: c.bg }}>
          <Text style={{ fontSize: 10, fontWeight: "700", color: c.fg, textTransform: "uppercase" }}>{quote.status}</Text>
        </View>
        <View style={{ flex: 1 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md }}>
        {/* Customer + total */}
        <View style={{ padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.hairline, gap: 6 }}>
          <Text style={{ fontSize: 11, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: "700" }}>Quote for</Text>
          <Text style={{ fontSize: 18, fontWeight: "700", color: colors.text }}>{quote.customers?.name ?? "No customer"}</Text>
          <Text style={{ fontSize: 28, fontWeight: "700", color: colors.text, letterSpacing: -0.5, marginTop: 8 }}>
            {fmtMoney(num(quote.total), currency)}
          </Text>
        </View>

        {/* Quick actions */}
        <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
          {quote.customer_id && (
            <BigBtn icon={<Send size={16} color="#fff" />} label="Share link" bg={colors.primary} onPress={shareLink} disabled={busy} />
          )}
          {quote.customers?.phone && (
            <BigBtn icon={<MessageSquare size={16} color="#fff" />} label="SMS" bg="#0f766e" onPress={() => Linking.openURL(`sms:${quote.customers!.phone!.replace(/\s/g, "")}`)} />
          )}
          {quote.customers?.email && (
            <BigBtn icon={<Mail size={16} color="#fff" />} label="Email" bg="#1d4ed8" onPress={() => Linking.openURL(`mailto:${quote.customers!.email!}`)} />
          )}
        </View>

        {/* Status + dup */}
        <View style={{ flexDirection: "row", gap: space.sm }}>
          <SmallBtn icon={<RotateCcw size={14} color={colors.text} />} label="Reset to draft" onPress={() => setStatus("draft")} disabled={busy || quote.status === "draft"} />
          <SmallBtn icon={<Copy size={14} color={colors.text} />} label="Duplicate" onPress={duplicate} disabled={busy} />
        </View>

        {/* Convert to invoice */}
        <Pressable
          onPress={convertToInvoice}
          disabled={busy || !!quote.invoice_id}
          style={({ pressed }) => ({
            flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
            padding: space.md, borderRadius: radius.lg,
            backgroundColor: quote.invoice_id ? colors.muted : pressed ? "#0d6e6a" : colors.primary,
            opacity: busy ? 0.6 : 1,
          })}
        >
          <FileCheck size={18} color="#fff" />
          <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>
            {quote.invoice_id ? "Already converted" : "Convert to invoice"}
          </Text>
        </Pressable>

        {/* Status changer */}
        <View style={{ padding: space.md, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.hairline, gap: space.sm }}>
          <Text style={{ fontSize: 11, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: "700" }}>Status</Text>
          <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
            {(["draft", "sent", "accepted", "rejected", "expired"] as const).map((s) => {
              const sc = STATUS_COLOUR[s];
              const selected = s === quote.status;
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
              {li.description ? (
                <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>{li.description}</Text>
              ) : null}
              <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>
                {li.quantity} × {fmtMoney(li.unit_price, currency)}{li.tax_rate ? ` · tax ${li.tax_rate}%` : ""}
              </Text>
            </View>
          ))}
        </View>

        {/* Totals */}
        <View style={{ padding: space.md, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.hairline, gap: 4 }}>
          <Row label="Subtotal" value={fmtMoney(num(quote.subtotal), currency)} />
          {num(quote.tax_total) > 0 && <Row label="Tax" value={fmtMoney(num(quote.tax_total), currency)} />}
          <View style={{ borderTopWidth: 1, borderTopColor: colors.hairline, paddingTop: 6, marginTop: 4 }}>
            <Row label="Total" value={fmtMoney(num(quote.total), currency)} bold />
          </View>
        </View>

        {/* Notes */}
        {quote.notes && (
          <View style={{ padding: space.md, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.hairline, gap: 6 }}>
            <Text style={{ fontSize: 11, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: "700" }}>Notes</Text>
            <Text style={{ fontSize: 14, color: colors.text, lineHeight: 20 }}>{quote.notes}</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
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
        backgroundColor: pressed ? colors.muted : colors.card,
        borderWidth: 1, borderColor: colors.hairline,
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

/** RN doesn't have a stable randomBytes; use Math.random for the token. The
 *  value isn't a security boundary on the client (RLS validates), it's just
 *  an unguessable opaque id like the web mints. */
function cryptoHex(byteLen: number): string {
  let out = "";
  for (let i = 0; i < byteLen * 2; i++) out += "0123456789abcdef"[Math.floor(Math.random() * 16)];
  return out;
}
