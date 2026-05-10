import { useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, Text, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Sparkles, X, Camera, ImagePlus } from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import { LineItem, newLineItem } from "./LineItemsEditor";
import { colors, radius, space } from "@/lib/theme";

interface SmartFillResult {
  existing_customer_id: string | null;
  new_customer: {
    name?: string; company?: string | null; email?: string | null;
    phone?: string | null; address?: string | null; city?: string | null;
    postcode?: string | null; country?: string | null;
  } | null;
  issue_date: string | null;
  due_date?: string | null;
  expiry_date?: string | null;
  line_items: Array<{ name: string; description?: string; quantity: number; unit_price: number; tax_rate: number }>;
  notes: string;
  terms: string;
}

/** Paste-text → AI extracts customer + line items + notes.
 *  Hits the existing /api/ai endpoint (smart_fill_document). The
 *  endpoint doesn't require auth — public-shaped API for the AI
 *  helper. */
export function SmartFillButton({
  businessId, mode, preselectedCustomer, onApply,
}: {
  businessId: string;
  mode: "quote" | "invoice";
  preselectedCustomer: { id: string; name: string } | null;
  onApply: (patch: {
    customer: { id: string; name: string } | null;
    items: LineItem[];
    notes: string;
    terms: string;
  }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  /** Take/pick a photo, run describe_images to get a scope of works, then
   *  feed that scope text into the existing Smart Fill flow. */
  const fillFromPhoto = async (source: "camera" | "library") => {
    try {
      const perm = source === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission required", "Allow access to use this.");
        return;
      }
      const picked = source === "camera"
        ? await ImagePicker.launchCameraAsync({ base64: true, quality: 0.6, mediaTypes: ImagePicker.MediaTypeOptions.Images })
        : await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.6, mediaTypes: ImagePicker.MediaTypeOptions.Images });
      if (picked.canceled || !picked.assets?.[0]?.base64) return;

      setBusy(true);
      const base = process.env.EXPO_PUBLIC_APP_URL ?? "https://kireihq.com";
      const r1 = await fetch(`${base}/api/ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "describe_images",
          images: [{ base64: picked.assets[0].base64, mediaType: picked.assets[0].mimeType ?? "image/jpeg" }],
        }),
      });
      if (!r1.ok) throw new Error(`Describe images failed: ${r1.status}`);
      const { result: scope } = await r1.json() as { result: string };
      setText((prev) => (prev ? prev + "\n\n" : "") + (scope ?? ""));
    } catch (e) {
      Alert.alert("Couldn't read photo", e instanceof Error ? e.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  };

  const run = async () => {
    if (!text.trim()) { Alert.alert("Paste something first", "Drop in an email, scope of works, or rough notes."); return; }
    setBusy(true);
    try {
      // Pull customer list so the AI can match an existing one
      const { data: customersData } = await supabase
        .from("customers").select("id, name, company, email")
        .eq("business_id", businessId).eq("archived", false).limit(500);
      const customers = (customersData ?? []) as Array<{ id: string; name: string; company: string | null; email: string | null }>;

      const base = process.env.EXPO_PUBLIC_APP_URL ?? "https://kireihq.com";
      const res = await fetch(`${base}/api/ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "smart_fill_document",
          mode,
          text,
          customers,
          defaultTaxRate: 10,
          today: new Date().toISOString().split("T")[0],
          preselected_customer: preselectedCustomer
            ? { id: preselectedCustomer.id, name: preselectedCustomer.name }
            : null,
        }),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(err || `AI returned ${res.status}`);
      }
      const { result } = await res.json() as { result: SmartFillResult };

      // Resolve customer
      let resolved: { id: string; name: string } | null = preselectedCustomer;
      if (result.existing_customer_id) {
        const c = customers.find((x) => x.id === result.existing_customer_id);
        if (c) resolved = { id: c.id, name: c.name };
      } else if (result.new_customer?.name) {
        // Mint the new customer right here so the form has a real id
        const { data: { user } } = await supabase.auth.getUser();
        const { data: created, error: cErr } = await supabase
          .from("customers").insert({
            business_id: businessId, user_id: user?.id,
            name:    result.new_customer.name,
            company: result.new_customer.company ?? null,
            email:   result.new_customer.email ?? null,
            phone:   result.new_customer.phone ?? null,
            address: result.new_customer.address ?? null,
            city:    result.new_customer.city ?? null,
            postcode: result.new_customer.postcode ?? null,
            country: result.new_customer.country ?? "Australia",
            archived: false,
          })
          .select("id, name").single();
        if (!cErr && created) resolved = created as { id: string; name: string };
      }

      const items: LineItem[] = (result.line_items ?? []).map((li) => {
        const base = newLineItem();
        const sub = (li.quantity ?? 1) * (li.unit_price ?? 0);
        return {
          ...base,
          name: li.name ?? "",
          description: li.description ?? "",
          quantity: li.quantity ?? 1,
          unit_price: li.unit_price ?? 0,
          tax_rate: li.tax_rate ?? 0,
          total: sub + (sub * (li.tax_rate ?? 0)) / 100,
        };
      });

      onApply({
        customer: resolved,
        items: items.length > 0 ? items : [newLineItem()],
        notes: result.notes ?? "",
        terms: result.terms ?? "",
      });
      setOpen(false);
      setText("");
    } catch (e) {
      Alert.alert("Smart Fill failed", e instanceof Error ? e.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Pressable onPress={() => setOpen(true)}
        style={({ pressed }) => ({
          flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
          padding: space.sm + 2, borderRadius: radius.md,
          backgroundColor: pressed ? colors.primarySoft : colors.card,
          borderWidth: 1, borderColor: colors.primary, borderStyle: "dashed",
        })}>
        <Sparkles size={14} color={colors.primary} />
        <Text style={{ fontSize: 12, fontWeight: "700", color: colors.primary }}>Smart Fill from text</Text>
      </Pressable>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, backgroundColor: colors.canvas, padding: space.lg, paddingTop: space.xl }}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: space.md }}>
            <Sparkles size={20} color={colors.primary} />
            <Text style={{ flex: 1, fontSize: 18, fontWeight: "700", color: colors.text, marginLeft: 8 }}>Smart Fill</Text>
            <Pressable onPress={() => setOpen(false)} hitSlop={8}><X size={22} color={colors.text} /></Pressable>
          </View>

          <Text style={{ fontSize: 12, color: colors.muted, marginBottom: space.sm, lineHeight: 18 }}>
            Paste an email, scope of works, or rough notes — the AI extracts the customer, line items, and notes for this {mode}. Or snap a job photo and let it write the scope for you.
          </Text>

          <View style={{ flexDirection: "row", gap: space.sm, marginBottom: space.sm }}>
            <Pressable onPress={() => fillFromPhoto("camera")} disabled={busy}
              style={({ pressed }) => ({
                flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
                padding: space.sm + 2, borderRadius: radius.md,
                backgroundColor: pressed ? colors.muted : colors.card,
                borderWidth: 1, borderColor: colors.hairline,
                opacity: busy ? 0.6 : 1,
              })}>
              <Camera size={14} color={colors.text} />
              <Text style={{ fontSize: 12, fontWeight: "700", color: colors.text }}>From camera</Text>
            </Pressable>
            <Pressable onPress={() => fillFromPhoto("library")} disabled={busy}
              style={({ pressed }) => ({
                flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
                padding: space.sm + 2, borderRadius: radius.md,
                backgroundColor: pressed ? colors.muted : colors.card,
                borderWidth: 1, borderColor: colors.hairline,
                opacity: busy ? 0.6 : 1,
              })}>
              <ImagePlus size={14} color={colors.text} />
              <Text style={{ fontSize: 12, fontWeight: "700", color: colors.text }}>From library</Text>
            </Pressable>
          </View>

          <TextInput
            value={text}
            onChangeText={setText}
            multiline
            placeholder={`e.g.\n\nHi — quote for Sarah Johnson, 12 Beach Rd Bondi.\n- Replace 4 panels\n- Repaint trim, 2 days @ $480/day\n- 10% gst\nDue end of month.`}
            placeholderTextColor={colors.muted}
            style={{
              flex: 1,
              padding: space.sm + 2, borderRadius: radius.md,
              backgroundColor: colors.card, borderWidth: 1, borderColor: colors.hairline,
              color: colors.text, fontSize: 14,
              textAlignVertical: "top",
              minHeight: 200,
              maxHeight: 400,
            }}
          />

          <Pressable onPress={run} disabled={busy}
            style={({ pressed }) => ({
              flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
              padding: space.md, borderRadius: radius.lg,
              backgroundColor: pressed ? "#0d6e6a" : colors.primary,
              opacity: busy ? 0.6 : 1, marginTop: space.md,
            })}>
            {busy ? <ActivityIndicator color="#fff" /> : <Sparkles size={18} color="#fff" />}
            <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>
              {busy ? "Extracting…" : "Extract & fill form"}
            </Text>
          </Pressable>
        </View>
      </Modal>
    </>
  );
}
