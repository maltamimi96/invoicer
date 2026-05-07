import { useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { ArrowLeft, Save } from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import { useActiveBusiness } from "@/lib/active-business";
import { CustomerPicker } from "@/components/CustomerPicker";
import { LineItemsEditor, LineItem, newLineItem, totalsFor } from "@/components/LineItemsEditor";
import { colors, radius, space } from "@/lib/theme";

/** Compose a new quote — customer + line items + notes/terms.
 *  Mints a fresh number from the business prefix counter. */
export default function NewQuote() {
  const router = useRouter();
  const { active } = useActiveBusiness();

  const [customer, setCustomer] = useState<{ id: string; name: string } | null>(null);
  const [items,    setItems]    = useState<LineItem[]>([newLineItem()]);
  const [notes,    setNotes]    = useState("");
  const [terms,    setTerms]    = useState("");
  const [busy,     setBusy]     = useState(false);

  const currency = active?.currency ?? "AUD";
  const totals   = totalsFor(items);

  const save = async () => {
    if (!active) return;
    if (!customer) { Alert.alert("Pick a customer", "Quotes need a customer attached."); return; }
    const validItems = items.filter((li) => li.name.trim().length > 0);
    if (validItems.length === 0) { Alert.alert("Add a line item", "Quotes need at least one line item with a name."); return; }

    setBusy(true);
    try {
      const { data: biz } = await supabase
        .from("businesses").select("quote_prefix, quote_next_number")
        .eq("id", active.id).single();
      const prefix = (biz as { quote_prefix?: string; quote_next_number?: number })?.quote_prefix ?? "QT";
      const nextNum = (biz as { quote_prefix?: string; quote_next_number?: number })?.quote_next_number ?? 1;
      const number = `${prefix}-${String(nextNum).padStart(4, "0")}`;
      await supabase.from("businesses").update({ quote_next_number: nextNum + 1 }).eq("id", active.id);

      const { data: { user } } = await supabase.auth.getUser();
      const today = new Date().toISOString().split("T")[0];
      const expiry = new Date(Date.now() + 30 * 86_400_000).toISOString().split("T")[0];

      const { data: created, error } = await supabase
        .from("quotes")
        .insert({
          user_id: user?.id, business_id: active.id, number,
          status: "draft",
          customer_id: customer.id,
          issue_date: today, expiry_date: expiry,
          line_items: validItems,
          subtotal: totals.subtotal, tax_total: totals.tax, total: totals.total,
          notes: notes.trim() || null, terms: terms.trim() || null,
        })
        .select("id").single();
      if (error) throw error;
      router.replace(`/quotes/${(created as { id: string }).id}` as never);
    } catch (e) {
      Alert.alert("Couldn't create quote", e instanceof Error ? e.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["top", "left", "right"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.sm, gap: space.sm }}>
        <Pressable onPress={() => router.back()} hitSlop={10}><ArrowLeft size={22} color={colors.text} /></Pressable>
        <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text }}>New quote</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md }} keyboardShouldPersistTaps="handled">
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 11, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: "700" }}>Customer *</Text>
          {active && <CustomerPicker businessId={active.id} value={customer} onChange={setCustomer} />}
        </View>

        <LineItemsEditor items={items} onChange={setItems} currency={currency} />

        <View style={{ padding: space.md, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.hairline, gap: 4 }}>
          <Row label="Subtotal" value={fmt(totals.subtotal, currency)} />
          {totals.tax > 0 && <Row label="Tax" value={fmt(totals.tax, currency)} />}
          <View style={{ borderTopWidth: 1, borderTopColor: colors.hairline, paddingTop: 6, marginTop: 4 }}>
            <Row label="Total" value={fmt(totals.total, currency)} bold />
          </View>
        </View>

        <Field label="Notes" value={notes} onChangeText={setNotes} multiline />
        <Field label="Terms" value={terms} onChangeText={setTerms} multiline />

        <Pressable
          onPress={save}
          disabled={busy}
          style={({ pressed }) => ({
            flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
            padding: space.md, borderRadius: radius.lg,
            backgroundColor: pressed ? "#0d6e6a" : colors.primary,
            opacity: busy ? 0.6 : 1,
            marginTop: space.sm,
          })}
        >
          <Save size={18} color="#fff" />
          <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>{busy ? "Saving…" : "Create quote"}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({ label, value, onChangeText, multiline }: { label: string; value: string; onChangeText: (v: string) => void; multiline?: boolean }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 11, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: "700" }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        style={{
          padding: space.sm + 2, borderRadius: radius.md,
          backgroundColor: colors.card, borderWidth: 1, borderColor: colors.hairline,
          color: colors.text, fontSize: 14,
          minHeight: multiline ? 70 : undefined,
          textAlignVertical: multiline ? "top" : "auto",
        }}
      />
    </View>
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

function fmt(n: number, currency: string): string {
  try { return new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(n); }
  catch { return `${currency} ${n.toFixed(2)}`; }
}
