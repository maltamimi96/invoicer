import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { ArrowLeft, Save } from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import { useActiveBusiness } from "@/lib/active-business";
import { colors, radius, space } from "@/lib/theme";

interface BusinessRow {
  id:        string;
  name:      string;
  email:     string | null;
  phone:     string | null;
  website:   string | null;
  currency:  string | null;
  abn:       string | null;
  address:   string | null;
  city:      string | null;
  state:     string | null;
  postcode:  string | null;
  country:   string | null;
}

const CURRENCIES = ["AUD", "NZD", "USD", "GBP", "EUR", "CAD"];

/** Edit basic business details — name, contact, currency, address.
 *  Mirrors the web /settings/business page (the basics block). */
export default function BusinessSettings() {
  const router = useRouter();
  const { active, refresh } = useActiveBusiness();
  const [biz, setBiz] = useState<BusinessRow | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!active) return;
    supabase.from("businesses").select("*").eq("id", active.id).maybeSingle()
      .then(({ data }) => setBiz(data as BusinessRow));
  }, [active?.id]);

  const save = async () => {
    if (!biz) return;
    if (!biz.name.trim()) {
      Alert.alert("Name required", "Business name can't be blank.");
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from("businesses")
      .update({
        name:     biz.name.trim(),
        email:    biz.email?.trim() || null,
        phone:    biz.phone?.trim() || null,
        website:  biz.website?.trim() || null,
        currency: biz.currency || "AUD",
        abn:      biz.abn?.trim() || null,
        address:  biz.address?.trim() || null,
        city:     biz.city?.trim() || null,
        state:    biz.state?.trim() || null,
        postcode: biz.postcode?.trim() || null,
        country:  biz.country?.trim() || "Australia",
      })
      .eq("id", biz.id);
    setBusy(false);
    if (error) {
      Alert.alert("Couldn't save", error.message);
      return;
    }
    await refresh();
    Alert.alert("Saved", "Business details updated.");
    router.back();
  };

  if (!biz) {
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
        <Text style={{ fontSize: 18, fontWeight: "700", color: colors.text }}>Business profile</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md }} keyboardShouldPersistTaps="handled">
        <Field label="Name *" value={biz.name} onChangeText={(v) => setBiz({ ...biz, name: v })} />
        <Field label="Email" value={biz.email ?? ""} onChangeText={(v) => setBiz({ ...biz, email: v })} keyboardType="email-address" autoCapitalize="none" />
        <Field label="Phone" value={biz.phone ?? ""} onChangeText={(v) => setBiz({ ...biz, phone: v })} keyboardType="phone-pad" />
        <Field label="Website" value={biz.website ?? ""} onChangeText={(v) => setBiz({ ...biz, website: v })} keyboardType="url" autoCapitalize="none" />
        <Field label="ABN" value={biz.abn ?? ""} onChangeText={(v) => setBiz({ ...biz, abn: v })} keyboardType="numeric" />

        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 11, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: "700" }}>Currency</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {CURRENCIES.map((c) => {
              const selected = (biz.currency ?? "AUD") === c;
              return (
                <Pressable key={c} onPress={() => setBiz({ ...biz, currency: c })}
                  style={({ pressed }) => ({
                    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
                    backgroundColor: selected ? colors.primary : pressed ? colors.muted : "transparent",
                    borderWidth: 1, borderColor: selected ? colors.primary : colors.hairline,
                  })}>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: selected ? "#fff" : colors.muted }}>{c}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Text style={{ fontSize: 11, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: "700", marginTop: space.sm }}>Address</Text>
        <Field label="Street" value={biz.address ?? ""} onChangeText={(v) => setBiz({ ...biz, address: v })} />
        <View style={{ flexDirection: "row", gap: space.sm }}>
          <View style={{ flex: 2 }}>
            <Field label="City" value={biz.city ?? ""} onChangeText={(v) => setBiz({ ...biz, city: v })} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="State" value={biz.state ?? ""} onChangeText={(v) => setBiz({ ...biz, state: v })} autoCapitalize="characters" />
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: space.sm }}>
          <View style={{ flex: 1 }}>
            <Field label="Postcode" value={biz.postcode ?? ""} onChangeText={(v) => setBiz({ ...biz, postcode: v })} keyboardType="numeric" />
          </View>
          <View style={{ flex: 2 }}>
            <Field label="Country" value={biz.country ?? "Australia"} onChangeText={(v) => setBiz({ ...biz, country: v })} />
          </View>
        </View>

        <Pressable onPress={save} disabled={busy}
          style={({ pressed }) => ({
            flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
            padding: space.md, borderRadius: radius.lg,
            backgroundColor: pressed ? "#0d6e6a" : colors.primary,
            opacity: busy ? 0.6 : 1,
            marginTop: space.md,
          })}>
          <Save size={18} color="#fff" />
          <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>Save changes</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({ label, value, onChangeText, keyboardType, autoCapitalize }: {
  label: string; value: string; onChangeText: (v: string) => void;
  keyboardType?: "default" | "email-address" | "numeric" | "phone-pad" | "url";
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
