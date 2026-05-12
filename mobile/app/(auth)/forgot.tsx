import { useState } from "react";
import {
  Alert, KeyboardAvoidingView, Platform, Pressable,
  ScrollView, Text, TextInput, View, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link, useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import { colors, radius, space } from "@/lib/theme";

/** Forgot-password — sends a Supabase recovery email. The reset link
 *  itself opens in the web (kireihq.com) — once the user picks a new
 *  password they sign in here normally. */
export default function ForgotPassword() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    const e = email.trim().toLowerCase();
    if (!e) { Alert.alert("Enter your email", "We need it to send the reset link."); return; }
    setBusy(true);
    const base = process.env.EXPO_PUBLIC_APP_URL ?? "https://kireihq.com";
    const { error } = await supabase.auth.resetPasswordForEmail(e, {
      redirectTo: `${base}/reset-password`,
    });
    setBusy(false);
    if (error) { Alert.alert("Couldn't send", error.message); return; }
    setSent(true);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: space.xl }}
          keyboardShouldPersistTaps="handled"
        >
          <Pressable onPress={() => router.back()} hitSlop={10} style={{ alignSelf: "flex-start", marginBottom: space.lg }}>
            <ArrowLeft size={22} color={colors.text} />
          </Pressable>

          <View style={{ marginBottom: space.xxl }}>
            <Text style={{ fontSize: 30, fontWeight: "700", color: colors.text, letterSpacing: -0.5 }}>
              Forgot password?
            </Text>
            <Text style={{ fontSize: 14, color: colors.muted, marginTop: 6 }}>
              We'll email you a link to set a new one.
            </Text>
          </View>

          {sent ? (
            <View style={{ backgroundColor: colors.card, borderRadius: radius.xl, padding: space.lg, borderWidth: 1, borderColor: colors.hairline, gap: space.sm }}>
              <Text style={{ fontSize: 16, fontWeight: "700", color: colors.text }}>Check your inbox</Text>
              <Text style={{ fontSize: 13, color: colors.muted, lineHeight: 19 }}>
                If an account exists for {email}, a password-reset link is on its way. Open it on any device, set a new password, then come back and sign in.
              </Text>
              <Link href="/(auth)/login" asChild>
                <Pressable
                  style={({ pressed }) => ({
                    backgroundColor: colors.primary, borderRadius: radius.pill,
                    paddingVertical: 12, alignItems: "center", marginTop: space.sm,
                    opacity: pressed ? 0.85 : 1,
                  })}>
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>Back to sign in</Text>
                </Pressable>
              </Link>
            </View>
          ) : (
            <View style={{ backgroundColor: colors.card, borderRadius: radius.xl, padding: space.lg, borderWidth: 1, borderColor: colors.hairline, gap: space.md }}>
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 11, color: colors.muted, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 }}>Email</Text>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  placeholder="you@example.com"
                  placeholderTextColor={colors.muted}
                  onSubmitEditing={submit}
                  style={{
                    backgroundColor: colors.surface2, borderRadius: radius.lg,
                    paddingHorizontal: 14, paddingVertical: 12,
                    fontSize: 15, color: colors.text,
                    borderWidth: 1, borderColor: colors.hairline,
                  }}
                />
              </View>

              <Pressable
                onPress={submit}
                disabled={busy}
                style={({ pressed }) => ({
                  backgroundColor: colors.primary, borderRadius: radius.pill,
                  paddingVertical: 14, alignItems: "center", marginTop: space.sm,
                  opacity: pressed || busy ? 0.85 : 1,
                })}
              >
                {busy
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>Send reset link</Text>}
              </Pressable>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
