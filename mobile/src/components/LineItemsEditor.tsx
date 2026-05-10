import { useEffect, useMemo, useState } from "react";
import { FlatList, Modal, Pressable, Text, TextInput, View } from "react-native";
import { Plus, Trash2, Package, X, Search } from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import { colors, radius, space } from "@/lib/theme";

export interface LineItem {
  id: string;
  name: string;
  description?: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  total: number;
}

const num = (v: string): number => {
  const n = parseFloat(v.replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};

function recalc(li: LineItem): LineItem {
  const subtotal = li.quantity * li.unit_price;
  return { ...li, total: subtotal + (subtotal * li.tax_rate) / 100 };
}

export function newLineItem(): LineItem {
  return recalc({
    id: Math.random().toString(36).slice(2),
    name: "", description: "",
    quantity: 1, unit_price: 0, tax_rate: 0, total: 0,
  });
}

export function totalsFor(items: LineItem[]): { subtotal: number; tax: number; total: number } {
  let subtotal = 0, tax = 0;
  for (const li of items) {
    const sub = li.quantity * li.unit_price;
    subtotal += sub;
    tax += (sub * li.tax_rate) / 100;
  }
  return { subtotal, tax, total: subtotal + tax };
}

/** Editable list of line items — mirrors the web LineItemsEditor (basic).
 *  When `businessId` is provided, exposes a "Pick from products" affordance
 *  that loads the saved product catalog and inserts a line item from one. */
export function LineItemsEditor({
  items, onChange, currency, businessId,
}: {
  items: LineItem[];
  onChange: (items: LineItem[]) => void;
  currency: string;
  businessId?: string;
}) {
  const update = (idx: number, patch: Partial<LineItem>) => {
    const next = items.slice();
    next[idx] = recalc({ ...next[idx], ...patch });
    onChange(next);
  };
  const remove = (idx: number) => onChange(items.filter((_, i) => i !== idx));
  const add = () => onChange([...items, newLineItem()]);

  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <View style={{ borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.hairline, overflow: "hidden" }}>
      <View style={{ paddingHorizontal: space.md, paddingTop: space.md, paddingBottom: 8, flexDirection: "row", alignItems: "center", gap: space.sm }}>
        <Text style={{ flex: 1, fontSize: 11, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: "700" }}>Line items</Text>
        {businessId && (
          <Pressable onPress={() => setPickerOpen(true)} hitSlop={8}
            style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 4, opacity: pressed ? 0.7 : 1 })}>
            <Package size={14} color={colors.muted} />
            <Text style={{ fontSize: 12, color: colors.muted, fontWeight: "700" }}>Products</Text>
          </Pressable>
        )}
        <Pressable onPress={add} hitSlop={8} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 4, opacity: pressed ? 0.7 : 1 })}>
          <Plus size={14} color={colors.primary} />
          <Text style={{ fontSize: 12, color: colors.primary, fontWeight: "700" }}>Add</Text>
        </Pressable>
      </View>

      {businessId && pickerOpen && (
        <ProductPicker
          businessId={businessId}
          onClose={() => setPickerOpen(false)}
          onPick={(p) => {
            const sub = (p.unit_price ?? 0);
            onChange([...items, recalc({
              id: Math.random().toString(36).slice(2),
              name: p.name,
              description: p.description ?? "",
              quantity: 1,
              unit_price: sub,
              tax_rate: p.tax_rate ?? 0,
              total: 0,
            })]);
            setPickerOpen(false);
          }}
        />
      )}
      {items.length === 0 ? (
        <View style={{ padding: space.md }}>
          <Text style={{ fontSize: 12, color: colors.muted }}>Tap Add to insert a line item</Text>
        </View>
      ) : items.map((li, idx) => (
        <View key={li.id} style={{ padding: space.md, gap: 6, borderTopWidth: 1, borderTopColor: colors.hairline }}>
          <View style={{ flexDirection: "row", gap: space.sm, alignItems: "center" }}>
            <TextInput
              placeholder="Item name"
              placeholderTextColor={colors.muted}
              value={li.name}
              onChangeText={(v) => update(idx, { name: v })}
              style={inputStyle}
            />
            <Pressable onPress={() => remove(idx)} hitSlop={8}>
              <Trash2 size={16} color="#991b1b" />
            </Pressable>
          </View>
          <TextInput
            placeholder="Description (optional)"
            placeholderTextColor={colors.muted}
            value={li.description ?? ""}
            onChangeText={(v) => update(idx, { description: v })}
            style={[inputStyle, { fontSize: 12 }]}
          />
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <Field label="Qty" value={String(li.quantity)} onChange={(v) => update(idx, { quantity: num(v) })} flex={1} />
            <Field label="Unit price" value={String(li.unit_price)} onChange={(v) => update(idx, { unit_price: num(v) })} flex={1.4} />
            <Field label="Tax %" value={String(li.tax_rate)} onChange={(v) => update(idx, { tax_rate: num(v) })} flex={0.8} />
          </View>
          <Text style={{ textAlign: "right", fontSize: 13, fontWeight: "700", color: colors.text }}>
            = {fmt(li.total, currency)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function Field({ label, value, onChange, flex }: { label: string; value: string; onChange: (v: string) => void; flex: number }) {
  return (
    <View style={{ flex, gap: 2 }}>
      <Text style={{ fontSize: 10, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</Text>
      <TextInput value={value} onChangeText={onChange} keyboardType="decimal-pad" style={inputStyle} />
    </View>
  );
}

const inputStyle = {
  flex: 1,
  paddingHorizontal: 10, paddingVertical: 8, borderRadius: radius.md,
  backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.hairline,
  color: colors.text, fontSize: 14,
} as const;

function fmt(n: number, currency: string): string {
  try { return new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(n); }
  catch { return `${currency} ${n.toFixed(2)}`; }
}

interface ProductLite {
  id: string; name: string; description: string | null;
  unit_price: number; tax_rate: number;
}

function ProductPicker({ businessId, onClose, onPick }: {
  businessId: string;
  onClose: () => void;
  onPick: (p: ProductLite) => void;
}) {
  const [all, setAll] = useState<ProductLite[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    supabase.from("products")
      .select("id, name, description, unit_price, tax_rate")
      .eq("business_id", businessId).eq("archived", false)
      .order("name", { ascending: true })
      .then(({ data }) => {
        const rows = (data ?? []) as Array<{ id: string; name: string; description: string | null; unit_price: unknown; tax_rate: unknown }>;
        setAll(rows.map((r) => ({
          id: r.id, name: r.name, description: r.description,
          unit_price: parseFloat(String(r.unit_price ?? 0)) || 0,
          tax_rate: parseFloat(String(r.tax_rate ?? 0)) || 0,
        })));
      });
  }, [businessId]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return all;
    return all.filter((p) => p.name.toLowerCase().includes(t) || (p.description ?? "").toLowerCase().includes(t));
  }, [all, q]);

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.canvas, padding: space.lg, paddingTop: space.xl }}>
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: space.md, gap: 8 }}>
          <Package size={20} color={colors.text} />
          <Text style={{ flex: 1, fontSize: 18, fontWeight: "700", color: colors.text }}>Pick a product</Text>
          <Pressable onPress={onClose} hitSlop={8}><X size={22} color={colors.text} /></Pressable>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: radius.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.hairline, marginBottom: space.sm }}>
          <Search size={14} color={colors.muted} />
          <TextInput
            placeholder="Search products"
            placeholderTextColor={colors.muted}
            value={q} onChangeText={setQ}
            autoFocus
            style={{ flex: 1, fontSize: 14, color: colors.text }}
          />
        </View>

        <FlatList
          data={filtered}
          keyExtractor={(p) => p.id}
          ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: colors.hairline }} />}
          ListEmptyComponent={<Text style={{ color: colors.muted, textAlign: "center", marginTop: space.xl }}>No products. Add some in Sales → Products.</Text>}
          renderItem={({ item }) => (
            <Pressable onPress={() => onPick(item)}
              style={({ pressed }) => ({ paddingVertical: space.sm + 2, opacity: pressed ? 0.6 : 1 })}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text style={{ flex: 1, fontSize: 15, fontWeight: "600", color: colors.text }}>{item.name}</Text>
                <Text style={{ fontSize: 14, fontWeight: "700", color: colors.text }}>
                  {new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(item.unit_price)}
                </Text>
              </View>
              {item.description && <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>{item.description}</Text>}
            </Pressable>
          )}
        />
      </View>
    </Modal>
  );
}
