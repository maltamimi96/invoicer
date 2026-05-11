import { useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, Modal, Pressable,
  RefreshControl, Text, TextInput, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { ArrowLeft, Plus, Package, Trash2, X } from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import { useActiveBusiness } from "@/lib/active-business";
import { colors, radius, space } from "@/lib/theme";

interface Product {
  id:          string;
  name:        string;
  description: string | null;
  unit_price:  unknown;
  tax_rate:    unknown;
  unit:        string | null;
}

const num = (v: unknown) => { const n = typeof v === "number" ? v : parseFloat(String(v ?? 0)); return Number.isFinite(n) ? n : 0; };
function fmt(n: number, currency: string): string {
  try { return new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(n); }
  catch { return `${currency} ${n.toFixed(2)}`; }
}

/** Product catalog — saved line items. Tap an item to copy into a
 *  new quote/invoice (deferred — Phase 4). For now: list + add + remove. */
export default function ProductsList() {
  const router = useRouter();
  const { active, role } = useActiveBusiness();
  const canEdit = role === "owner" || role === "admin" || role === "editor";

  const [products,   setProducts]   = useState<Product[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [modalOpen,  setModalOpen]  = useState(false);

  const currency = active?.currency ?? "AUD";

  const load = async () => {
    if (!active) return;
    const { data } = await supabase
      .from("products")
      .select("id, name, description, unit_price, tax_rate, unit")
      .eq("business_id", active.id)
      .eq("archived", false)
      .order("name", { ascending: true }).limit(100);
    setProducts((data ?? []) as Product[]);
  };

  useEffect(() => { load(); }, [active?.id]);

  const remove = (p: Product) => {
    Alert.alert("Remove product?", p.name, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove", style: "destructive",
        onPress: async () => {
          await supabase.from("products").update({ archived: true }).eq("id", p.id);
          load();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["top", "left", "right"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.sm, gap: space.sm }}>
        <Pressable onPress={() => router.back()} hitSlop={10}><ArrowLeft size={22} color={colors.text} /></Pressable>
        <Package size={18} color={colors.text} />
        <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text }}>Products</Text>
        <View style={{ flex: 1 }} />
        {canEdit && (
          <Pressable onPress={() => setModalOpen(true)} hitSlop={8}
            style={({ pressed }) => ({ padding: 6, borderRadius: 999, backgroundColor: pressed ? colors.muted : colors.primary })}>
            <Plus size={18} color="#fff" />
          </Pressable>
        )}
      </View>

      {!products ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <FlatList
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={7}
          removeClippedSubviews
          data={products}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: space.lg, gap: space.sm }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={{ alignItems: "center", padding: space.xl, gap: 6 }}>
              <Package size={36} color={colors.muted} />
              <Text style={{ color: colors.text, fontWeight: "700" }}>No products yet</Text>
              <Text style={{ color: colors.muted, fontSize: 12, textAlign: "center" }}>
                Add the things you sell — quick-pick into quotes/invoices later.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={{ padding: space.md, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.hairline }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: "600", color: colors.text }}>{item.name}</Text>
                  {item.description && (
                    <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>{item.description}</Text>
                  )}
                  <Text style={{ fontSize: 13, color: colors.text, marginTop: 4 }}>
                    {fmt(num(item.unit_price), currency)}{item.unit ? ` / ${item.unit}` : ""}
                    {num(item.tax_rate) > 0 ? ` · tax ${num(item.tax_rate)}%` : ""}
                  </Text>
                </View>
                {canEdit && (
                  <Pressable onPress={() => remove(item)} hitSlop={8}><Trash2 size={16} color="#991b1b" /></Pressable>
                )}
              </View>
            </View>
          )}
        />
      )}

      {modalOpen && active && (
        <AddProductModal
          businessId={active.id}
          currency={currency}
          onClose={() => setModalOpen(false)}
          onAdded={() => { setModalOpen(false); load(); }}
        />
      )}
    </SafeAreaView>
  );
}

function AddProductModal({ businessId, currency, onClose, onAdded }: {
  businessId: string; currency: string; onClose: () => void; onAdded: () => void;
}) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [unitPrice, setUnitPrice] = useState("0");
  const [taxRate, setTaxRate] = useState("10");
  const [unit, setUnit] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim()) { Alert.alert("Name required", "Give the product a name."); return; }
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("products").insert({
      business_id: businessId,
      user_id: user?.id,
      name: name.trim(),
      description: desc.trim() || null,
      unit_price: parseFloat(unitPrice) || 0,
      tax_rate: parseFloat(taxRate) || 0,
      unit: unit.trim() || null,
      archived: false,
    });
    setBusy(false);
    if (error) { Alert.alert("Couldn't save", error.message); return; }
    onAdded();
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>
        <View style={{ flex: 1, padding: space.lg, gap: space.md }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={{ flex: 1, fontSize: 20, fontWeight: "700", color: colors.text }}>Add product</Text>
            <Pressable onPress={onClose} hitSlop={8}><X size={22} color={colors.text} /></Pressable>
          </View>

          <Field label="Name *" value={name} onChangeText={setName} />
          <Field label="Description" value={desc} onChangeText={setDesc} multiline />

          <View style={{ flexDirection: "row", gap: space.sm }}>
            <View style={{ flex: 2 }}>
              <Field label={`Unit price (${currency})`} value={unitPrice} onChangeText={setUnitPrice} keyboardType="decimal-pad" />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Tax %" value={taxRate} onChangeText={setTaxRate} keyboardType="decimal-pad" />
            </View>
          </View>

          <Field label="Unit (optional)" value={unit} onChangeText={setUnit} placeholder="hour, m², each…" />

          <Pressable onPress={submit} disabled={busy}
            style={({ pressed }) => ({
              flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
              padding: space.md, borderRadius: radius.lg,
              backgroundColor: pressed ? "#0d6e6a" : colors.primary,
              opacity: busy ? 0.6 : 1, marginTop: space.sm,
            })}>
            <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>{busy ? "Saving…" : "Save product"}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function Field({ label, value, onChangeText, multiline, keyboardType, placeholder }: {
  label: string; value: string; onChangeText: (v: string) => void;
  multiline?: boolean;
  keyboardType?: "default" | "decimal-pad" | "numeric";
  placeholder?: string;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 11, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: "700" }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        keyboardType={keyboardType}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        style={{
          padding: space.sm + 2, borderRadius: radius.md,
          backgroundColor: colors.card, borderWidth: 1, borderColor: colors.hairline,
          color: colors.text, fontSize: 14,
          minHeight: multiline ? 60 : undefined,
          textAlignVertical: multiline ? "top" : "auto",
        }}
      />
    </View>
  );
}
