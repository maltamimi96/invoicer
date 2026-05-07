import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { ArrowLeft, Check } from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import { useActiveBusiness } from "@/lib/active-business";
import { colors, radius, space } from "@/lib/theme";

const AU_STATES = ["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"];

/** New customer form — Australia-flavoured (suburb + state dropdown). */
export default function NewCustomer() {
  const router = useRouter();
  const { active } = useActiveBusiness();
  const [busy, setBusy] = useState(false);

  const [name, setName]       = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone]     = useState("");
  const [email, setEmail]     = useState("");
  const [address, setAddress] = useState("");
  const [suburb, setSuburb]   = useState("");
  const [state, setState]     = useState("");
  const [postcode, setPost]   = useState("");
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
          address: address.trim() || null,
          city: suburb.trim() || null,
          state: state || null,
          postcode: postcode.trim() || null,
          country: "Australia",
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

      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md }}>
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

        <Field label="Street address">
          <TextInput value={address} onChangeText={setAddress} placeholder="12 Smith Street" placeholderTextColor={colors.muted} style={input} />
        </Field>
        <View style={{ flexDirection: "row", gap: space.sm }}>
          <View style={{ flex: 2, gap: 6 }}>
            <Text style={fieldLabel}>Suburb</Text>
            <TextInput value={suburb} onChangeText={setSuburb} placeholder="Bondi" placeholderTextColor={colors.muted} style={input} />
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={fieldLabel}>Postcode</Text>
            <TextInput value={postcode} onChangeText={setPost} placeholder="2026" keyboardType="numeric" placeholderTextColor={colors.muted} style={input} />
          </View>
        </View>
        <Field label="State">
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {AU_STATES.map((s) => (
              <Pressable key={s} onPress={() => setState(s)}
                style={({ pressed }) => ({
                  paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
                  backgroundColor: state === s ? colors.primary : pressed ? colors.muted : "transparent",
                  borderWidth: 1, borderColor: state === s ? colors.primary : colors.hairline,
                })}>
                <Text style={{ fontSize: 12, fontWeight: "700", color: state === s ? "#fff" : colors.text }}>{s}</Text>
              </Pressable>
            ))}
          </View>
        </Field>

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
