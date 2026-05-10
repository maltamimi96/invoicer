import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { ArrowLeft, Check } from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import { useActiveBusiness } from "@/lib/active-business";
import { colors, radius, space } from "@/lib/theme";

const SOURCE_PRESETS = [
  "manual", "website", "referral", "phone", "email",
  "hipages", "service-seeking", "google", "facebook", "instagram", "word-of-mouth",
];
const SOURCE_LABELS: Record<string, string> = {
  "landing-page": "Landing Page", "website": "Website", "referral": "Referral",
  "telegram": "Telegram", "email": "Email", "phone": "Phone", "manual": "Manual",
  "hipages": "HiPages", "service-seeking": "ServiceSeeking", "google": "Google",
  "facebook": "Facebook", "instagram": "Instagram", "word-of-mouth": "Word of mouth",
};
function fmtSource(s: string): string {
  return SOURCE_LABELS[s] ?? s.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function NewLead() {
  const router = useRouter();
  const { active } = useActiveBusiness();
  const [busy, setBusy] = useState(false);

  const [name, setName]       = useState("");
  const [phone, setPhone]     = useState("");
  const [email, setEmail]     = useState("");
  const [suburb, setSuburb]   = useState("");
  const [service, setService] = useState("");
  const [timing, setTiming]   = useState("");
  const [notes, setNotes]     = useState("");
  const [source, setSource]   = useState("manual");

  const submit = async () => {
    if (!active || !name.trim()) {
      Alert.alert("Name required", "Add a name for this lead.");
      return;
    }
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("leads")
        .insert({
          business_id: active.id, user_id: user?.id,
          name: name.trim(),
          phone: phone.trim() || null,
          email: email.trim() || null,
          suburb: suburb.trim() || null,
          service: service.trim() || null,
          timing: timing.trim() || null,
          notes: notes.trim() || null,
          source: source.trim() || "manual",
          status: "new",
        })
        .select("id").single();
      if (error) throw error;
      router.replace(`/leads/${(data as { id: string }).id}` as never);
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
        <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text }}>New lead</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md }}>
        <Field label="Name *">
          <TextInput value={name} onChangeText={setName} placeholder="Full name" placeholderTextColor={colors.muted} style={input()} />
        </Field>
        <Field label="Phone">
          <TextInput value={phone} onChangeText={setPhone} placeholder="+61 …" keyboardType="phone-pad" placeholderTextColor={colors.muted} style={input()} />
        </Field>
        <Field label="Email">
          <TextInput value={email} onChangeText={setEmail} placeholder="name@example.com" keyboardType="email-address" autoCapitalize="none" placeholderTextColor={colors.muted} style={input()} />
        </Field>
        <Field label="Suburb">
          <TextInput value={suburb} onChangeText={setSuburb} placeholder="Bondi" placeholderTextColor={colors.muted} style={input()} />
        </Field>
        <Field label="Service">
          <TextInput value={service} onChangeText={setService} placeholder="What do they need?" placeholderTextColor={colors.muted} style={input()} />
        </Field>
        <Field label="Timing">
          <TextInput value={timing} onChangeText={setTiming} placeholder="ASAP / next week / no rush" placeholderTextColor={colors.muted} style={input()} />
        </Field>

        <Field label="Source">
          <TextInput
            value={source}
            onChangeText={setSource}
            placeholder="hipages, referral, walk-in…"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            style={input()}
          />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
            {SOURCE_PRESETS.map((s) => (
              <Pressable key={s} onPress={() => setSource(s)}
                style={({ pressed }) => ({
                  paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
                  backgroundColor: source === s ? colors.primary : pressed ? colors.muted : "transparent",
                  borderWidth: 1, borderColor: source === s ? colors.primary : colors.hairline,
                })}>
                <Text style={{ fontSize: 11, fontWeight: "600", color: source === s ? "#fff" : colors.text }}>{fmtSource(s)}</Text>
              </Pressable>
            ))}
          </View>
        </Field>

        <Field label="Notes">
          <TextInput value={notes} onChangeText={setNotes} placeholder="Any context…" multiline numberOfLines={3} placeholderTextColor={colors.muted} style={[input(), { minHeight: 80, textAlignVertical: "top" }]} />
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
          <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>Save lead</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const input = () => ({
  fontSize: 15, padding: space.md, borderRadius: radius.md,
  backgroundColor: colors.card, borderWidth: 1, borderColor: colors.hairline, color: colors.text,
});

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 11, color: colors.muted, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</Text>
      {children}
    </View>
  );
}
