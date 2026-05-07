import { useEffect, useMemo, useState } from "react";
import { FlatList, Modal, Pressable, Text, TextInput, View } from "react-native";
import { ChevronDown, Search, X } from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import { colors, radius, space } from "@/lib/theme";

interface CustomerLite {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

/** Inline dropdown trigger + modal customer picker with live search. */
export function CustomerPicker({
  businessId, value, onChange,
}: {
  businessId: string;
  value: { id: string; name: string } | null;
  onChange: (c: { id: string; name: string } | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState<CustomerLite[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!open) return;
    supabase.from("customers")
      .select("id, name, email, phone")
      .eq("business_id", businessId)
      .eq("archived", false)
      .order("name", { ascending: true })
      .then(({ data }) => setAll((data ?? []) as CustomerLite[]));
  }, [open, businessId]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return all;
    return all.filter((c) =>
      c.name.toLowerCase().includes(term) ||
      (c.email ?? "").toLowerCase().includes(term) ||
      (c.phone ?? "").toLowerCase().includes(term)
    );
  }, [all, q]);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => ({
          flexDirection: "row", alignItems: "center", gap: 8,
          padding: space.sm + 2, borderRadius: radius.md,
          backgroundColor: colors.card, borderWidth: 1, borderColor: colors.hairline,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Text style={{ flex: 1, fontSize: 14, color: value ? colors.text : colors.muted }}>
          {value?.name ?? "Pick a customer…"}
        </Text>
        <ChevronDown size={16} color={colors.muted} />
      </Pressable>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, backgroundColor: colors.canvas, padding: space.lg, paddingTop: space.xl }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, marginBottom: space.md }}>
            <Text style={{ flex: 1, fontSize: 18, fontWeight: "700", color: colors.text }}>Pick a customer</Text>
            <Pressable onPress={() => setOpen(false)} hitSlop={8}>
              <X size={22} color={colors.text} />
            </Pressable>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: radius.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.hairline, marginBottom: space.sm }}>
            <Search size={14} color={colors.muted} />
            <TextInput
              placeholder="Search by name, email or phone"
              placeholderTextColor={colors.muted}
              value={q}
              onChangeText={setQ}
              autoFocus
              style={{ flex: 1, fontSize: 14, color: colors.text }}
            />
          </View>

          <FlatList
            data={filtered}
            keyExtractor={(c) => c.id}
            ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: colors.hairline }} />}
            ListEmptyComponent={<Text style={{ color: colors.muted, textAlign: "center", marginTop: space.xl }}>No customers</Text>}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => { onChange({ id: item.id, name: item.name }); setOpen(false); }}
                style={({ pressed }) => ({ paddingVertical: space.sm + 2, opacity: pressed ? 0.6 : 1 })}
              >
                <Text style={{ fontSize: 15, fontWeight: "600", color: colors.text }}>{item.name}</Text>
                {(item.email || item.phone) && (
                  <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                    {[item.phone, item.email].filter(Boolean).join(" · ")}
                  </Text>
                )}
              </Pressable>
            )}
          />
        </View>
      </Modal>
    </>
  );
}
