import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { ArrowLeft, Save, Landmark } from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import { useActiveBusiness } from "@/lib/active-business";
import { colors, radius, space } from "@/lib/theme";

interface BankRow {
  bank_name:           string | null;
  bank_account_name:   string | null;
  bank_account_number: string | null;
  bank_sort_code:      string | null;
  bank_iban:           string | null;
}

/** Bank details — appears on invoice PDFs / payment instructions.
 *  Owner/admin only. AU + UK + EU friendly (BSB doubles as sort code). */
export default function BankSettings() {
  const router = useRouter();
  const { active, role } = useActiveBusiness();
  const canEdit = role === "owner" || role === "admin";

  const [row,  setRow]  = useState<BankRow | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!active) return;
    supabase.from("businesses")
      .select("bank_name, bank_account_name, bank_account_number, bank_sort_code, bank_iban")
      .eq("id", active.id).maybeSingle()
      .then(({ data }) => setRow((data as BankRow) ?? {
        bank_name: null, bank_account_name: null, bank_account_number: null,
        bank_sort_code: null, bank_iban: null,
      }));
  }, [active?.id]);

  const save = async () => {
    if (!row || !active || !canEdit) return;
    setBusy(true);
    const { error } = await supabase.from("businesses").update({
      bank_name:           row.bank_name?.trim() || null,
      bank_account_name:   row.bank_account_name?.trim() || null,
      bank_account_number: row.bank_account_number?.trim() || null,
      bank_sort_code:      row.bank_sort_code?.trim() || null,
      bank_iban:           row.bank_iban?.trim() || null,
    }).eq("id", active.id);
    setBusy(false);
    if (error) { Alert.alert("Couldn't save", error.message); return; }
    Alert.alert("Saved", "Bank details updated.");
    router.back();
  };

  if (!row) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["top", "left", "right"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.sm, gap: space.sm }}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <ArrowLeft size={22} color={colors.text} />
        </Pressable>
        <Landmark size={18} color={colors.text} />
        <Text style={{ fontSize: 18, fontWeight: "700", color: colors.text }}>Bank details</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md }} keyboardShouldPersistTaps="handled">
        <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 18 }}>
          Shown on invoice PDFs and customer hub payment screens. Leave a field blank to hide it.
        </Text>

        <Field label="Bank name"      value={row.bank_name ?? ""}           onChangeText={(v) => setRow({ ...row, bank_name: v })} />
        <Field label="Account name"   value={row.bank_account_name ?? ""}   onChangeText={(v) => setRow({ ...row, bank_account_name: v })} />
        <Field label="Account number" value={row.bank_account_number ?? ""} onChangeText={(v) => setRow({ ...row, bank_account_number: v })} keyboardType="numeric" />
        <Field label="BSB / Sort code" value={row.bank_sort_code ?? ""}     onChangeText={(v) => setRow({ ...row, bank_sort_code: v })} keyboardType="numeric" />
        <Field label="IBAN / SWIFT (optional)" value={row.bank_iban ?? ""}  onChangeText={(v) => setRow({ ...row, bank_iban: v })} autoCapitalize="characters" />

        {canEdit ? (
          <Pressable onPress={save} disabled={busy}
            style={({ pressed }) => ({
              flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
              padding: space.md, borderRadius: radius.lg,
              backgroundColor: pressed ? "#0d6e6a" : colors.primary,
              opacity: busy ? 0.6 : 1, marginTop: space.md,
            })}>
            <Save size={18} color="#fff" />
            <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>{busy ? "Saving…" : "Save bank details"}</Text>
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

function Field({ label, value, onChangeText, keyboardType, autoCapitalize }: {
  label: string; value: string; onChangeText: (v: string) => void;
  keyboardType?: "default" | "numeric";
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 11, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: "700" }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        style={{
          padding: space.sm + 2, borderRadius: radius.md,
          backgroundColor: colors.card, borderWidth: 1, borderColor: colors.hairline,
          color: colors.text, fontSize: 14,
        }}
      />
    </View>
  );
}
