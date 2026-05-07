import { Pressable, Text, TextInput, View } from "react-native";
import { Plus, Trash2 } from "lucide-react-native";
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

/** Editable list of line items — mirrors the web LineItemsEditor (basic). */
export function LineItemsEditor({
  items, onChange, currency,
}: {
  items: LineItem[];
  onChange: (items: LineItem[]) => void;
  currency: string;
}) {
  const update = (idx: number, patch: Partial<LineItem>) => {
    const next = items.slice();
    next[idx] = recalc({ ...next[idx], ...patch });
    onChange(next);
  };
  const remove = (idx: number) => onChange(items.filter((_, i) => i !== idx));
  const add = () => onChange([...items, newLineItem()]);

  return (
    <View style={{ borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.hairline, overflow: "hidden" }}>
      <View style={{ paddingHorizontal: space.md, paddingTop: space.md, paddingBottom: 8, flexDirection: "row", alignItems: "center" }}>
        <Text style={{ flex: 1, fontSize: 11, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: "700" }}>Line items</Text>
        <Pressable onPress={add} hitSlop={8} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 4, opacity: pressed ? 0.7 : 1 })}>
          <Plus size={14} color={colors.primary} />
          <Text style={{ fontSize: 12, color: colors.primary, fontWeight: "700" }}>Add</Text>
        </Pressable>
      </View>
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
