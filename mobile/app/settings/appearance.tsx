import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { ArrowLeft, Save, Palette, Check } from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import { useActiveBusiness } from "@/lib/active-business";
import { colors, radius, space } from "@/lib/theme";
import { ThemeToggle } from "@/components/ThemeToggle";

const ACCENTS: Array<{ id: string; label: string; hex: string }> = [
  { id: "blue",    label: "Blue",    hex: "#1d4ed8" },
  { id: "green",   label: "Green",   hex: "#16a34a" },
  { id: "purple",  label: "Purple",  hex: "#7c3aed" },
  { id: "amber",   label: "Amber",   hex: "#d97706" },
  { id: "rose",    label: "Rose",    hex: "#e11d48" },
  { id: "teal",    label: "Teal",    hex: "#0f766e" },
  { id: "slate",   label: "Slate",   hex: "#334155" },
];

const PATTERNS: Array<{ id: string; label: string }> = [
  { id: "none",  label: "None" },
  { id: "grid",  label: "Grid" },
  { id: "dots",  label: "Dots" },
  { id: "lines", label: "Lines" },
];

/** Edit accent color and background pattern. Mirrors web /settings/appearance.
 *  Affects PDFs, customer hub, and dashboard accents. Owner/admin only. */
export default function AppearanceSettings() {
  const router = useRouter();
  const { active, role } = useActiveBusiness();
  const canEdit = role === "owner" || role === "admin";

  const [accent, setAccent]   = useState<string>("blue");
  const [pattern, setPattern] = useState<string>("none");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState(false);

  useEffect(() => {
    if (!active) return;
    supabase.from("businesses")
      .select("accent_color, bg_pattern")
      .eq("id", active.id).maybeSingle()
      .then(({ data }) => {
        const row = data as { accent_color?: string; bg_pattern?: string } | null;
        setAccent(row?.accent_color ?? "blue");
        setPattern(row?.bg_pattern ?? "none");
        setLoading(false);
      });
  }, [active?.id]);

  const save = async () => {
    if (!active || !canEdit) return;
    setBusy(true);
    const { error } = await supabase.from("businesses")
      .update({ accent_color: accent, bg_pattern: pattern })
      .eq("id", active.id);
    setBusy(false);
    if (error) { Alert.alert("Couldn't save", error.message); return; }
    Alert.alert("Saved", "Appearance updated.");
    router.back();
  };

  if (loading) {
    return <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={colors.primary} /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["top", "left", "right"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.sm, gap: space.sm }}>
        <Pressable onPress={() => router.back()} hitSlop={10}><ArrowLeft size={22} color={colors.text} /></Pressable>
        <Palette size={18} color={colors.text} />
        <Text style={{ fontSize: 18, fontWeight: "700", color: colors.text }}>Appearance</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg }}>
        <View style={{ gap: space.sm }}>
          <Text style={{ fontSize: 11, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: "700" }}>Theme</Text>
          <ThemeToggle variant="segmented" />
          <Text style={{ fontSize: 11, color: colors.muted, lineHeight: 16 }}>System follows your phone&apos;s setting.</Text>
        </View>

        <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 18 }}>
          Accent + pattern below affect invoice/quote PDFs and the customer hub.
        </Text>

        <View style={{ gap: space.sm }}>
          <Text style={{ fontSize: 11, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: "700" }}>Accent colour</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {ACCENTS.map((a) => {
              const selected = a.id === accent;
              return (
                <Pressable key={a.id} onPress={() => setAccent(a.id)} disabled={!canEdit}
                  style={({ pressed }) => ({
                    width: 64, alignItems: "center", gap: 6,
                    opacity: pressed ? 0.7 : 1,
                  })}>
                  <View style={{
                    width: 44, height: 44, borderRadius: 22,
                    backgroundColor: a.hex,
                    borderWidth: selected ? 3 : 0,
                    borderColor: colors.text,
                    alignItems: "center", justifyContent: "center",
                  }}>
                    {selected && <Check size={18} color="#fff" />}
                  </View>
                  <Text style={{ fontSize: 11, color: colors.muted }}>{a.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={{ gap: space.sm }}>
          <Text style={{ fontSize: 11, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: "700" }}>Background pattern</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {PATTERNS.map((p) => {
              const selected = p.id === pattern;
              return (
                <Pressable key={p.id} onPress={() => setPattern(p.id)} disabled={!canEdit}
                  style={({ pressed }) => ({
                    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
                    backgroundColor: selected ? colors.primary : pressed ? colors.muted : colors.card,
                    borderWidth: 1, borderColor: selected ? colors.primary : colors.hairline,
                  })}>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: selected ? "#fff" : colors.text }}>{p.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {canEdit ? (
          <Pressable onPress={save} disabled={busy}
            style={({ pressed }) => ({
              flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
              padding: space.md, borderRadius: radius.lg,
              backgroundColor: pressed ? "#0d6e6a" : colors.primary,
              opacity: busy ? 0.6 : 1, marginTop: space.md,
            })}>
            <Save size={18} color="#fff" />
            <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>{busy ? "Saving…" : "Save appearance"}</Text>
          </Pressable>
        ) : (
          <Text style={{ fontSize: 12, color: colors.muted, textAlign: "center", marginTop: space.md }}>
            Read-only — owner or admin can edit.
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

