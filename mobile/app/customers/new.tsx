import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { ArrowLeft, Check } from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import { useActiveBusiness } from "@/lib/active-business";
import { AddressFields, AddressValue } from "@/components/AddressFields";
import { colors, radius, space } from "@/lib/theme";

/** New customer form. Address fields adapt per-country (mirrors web). */
export default function NewCustomer() {
  const router = useRouter();
  const { active } = useActiveBusiness();
  const [busy, setBusy] = useState(false);

  const [name, setName]       = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone]     = useState("");
  const [email, setEmail]     = useState("");
  const [addr, setAddr]       = useState<AddressValue>({
    address: "", city: "", state: "", postcode: "",
    country: active?.country ?? "Australia",
  });
  const [notes, setNotes]     = useState("");

  const submit = async () => {
    if (!active || !name.trim()) {
      Alert.alert("Name required");
      return;
    }
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("customers")
        .insert({
          business_id: active.id, user_id: user?.id,
          name: name.trim(),
          company: company.trim() || null,
          phone: phone.trim() || null,
          email: email.trim() || null,
          address: addr.address.trim() || null,
          city: addr.city.trim() || null,
          state: addr.state.trim() || null,
          postcode: addr.postcode.trim() || null,
          country: addr.country.trim() || "Australia",
          notes: notes.trim() || null,
          archived: false,
        })
        .select("id").single();
      if (error) throw error;
      router.replace(`/customers/${(data as { id: string }).id}` as never);
    } catch (e) {
      Alert.alert("Couldn't save", e instanceof Error ? e.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["top", "left", "right"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.sm, gap: space.sm }}>
        <Pressable onPress={() => router.back()} hitSlop={10}><ArrowLeft size={22} color={colors.text} /></Pressable>
        <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text }}>New customer</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md }} keyboardShouldPersistTaps="handled">
        <Field label="Name *">
          <TextInput value={name} onChangeText={setName} placeholder="Full name" placeholderTextColor={colors.muted} style={input} />
        </Field>
        <Field label="Company">
          <TextInput value={company} onChangeText={setCompany} placeholder="Optional" placeholderTextColor={colors.muted} style={input} />
        </Field>
        <Field label="Phone">
          <TextInput value={phone} onChangeText={setPhone} placeholder="+61 …" keyboardType="phone-pad" placeholderTextColor={colors.muted} style={input} />
        </Field>
        <Field label="Email">
          <TextInput value={email} onChangeText={setEmail} placeholder="name@example.com" keyboardType="email-address" autoCapitalize="none" placeholderTextColor={colors.muted} style={input} />
        </Field>

        <AddressFields value={addr} onChange={setAddr} businessCountry={active?.country ?? null} />

        <Field label="Notes">
          <TextInput value={notes} onChangeText={setNotes} placeholder="Internal notes…" multiline numberOfLines={3} placeholderTextColor={colors.muted} style={[input, { minHeight: 80, textAlignVertical: "top" }]} />
        </Field>

        <Pressable
          onPress={submit}
          disabled={busy}
          style={({ pressed }) => ({
            flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
            padding: space.md, borderRadius: radius.lg,
            backgroundColor: busy ? colors.muted : pressed ? "#0d6e6a" : colors.primary,
            marginTop: space.md,
          })}
        >
          {busy ? <ActivityIndicator color="#fff" /> : <Check size={18} color="#fff" />}
          <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>Save customer</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const input = {
  fontSize: 15, padding: space.md, borderRadius: radius.md,
  backgroundColor: colors.card, borderWidth: 1, borderColor: colors.hairline, color: colors.text,
};

const fieldLabel = { fontSize: 11, color: colors.muted, fontWeight: "700" as const, textTransform: "uppercase" as const, letterSpacing: 0.5 };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}
