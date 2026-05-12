import { useState } from "react";
import {
  Alert, KeyboardAvoidingView, Platform, Pressable,
  ScrollView, Text, TextInput, View, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Sparkles } from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import { colors, gradients, radius, space, timeOfDayGradient } from "@/lib/theme";
import { FadeIn } from "@/components/FadeIn";
import { PatternBackground } from "@/components/PatternBackground";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email.trim() || !password) {
      Alert.alert("Missing details", "Enter your email and password.");
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    setBusy(false);
    if (error) {
      Alert.alert("Couldn't sign in", error.message);
      return;
    }
    // Belt-and-braces redirect — the root layout's onAuthStateChange handler
    // also fires, but we route directly so success isn't dependent on that
    // listener winning the race.
    if (data.session) router.replace("/(tabs)");
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: space.xl, gap: space.lg }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Hero brand block */}
          <FadeIn>
            <View style={{ borderRadius: radius.xxl, overflow: "hidden" }}>
              <LinearGradient
                colors={timeOfDayGradient() as unknown as readonly [string, string, ...string[]]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={{ padding: space.lg + 6, gap: space.sm, minHeight: 160 }}
              >
                <PatternBackground variant="dots" color="#fff" opacity={0.16} />
                <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: "rgba(255,255,255,0.35)" }}>
                  <Sparkles size={24} color="#fff" />
                </View>
                <Text style={{ fontSize: 32, fontWeight: "800", color: "#fff", letterSpacing: -0.6, marginTop: space.sm }}>
                  Kirei
                </Text>
                <Text style={{ fontSize: 14, color: "rgba(255,255,255,0.9)", marginTop: 2 }}>
                  Run your trades business from your phone.
                </Text>
              </LinearGradient>
            </View>
          </FadeIn>

          <FadeIn delay={120}>
            <View
              style={{
                backgroundColor: colors.card,
                borderRadius: radius.xl,
                padding: space.lg,
                borderWidth: 1,
                borderColor: colors.hairline,
                gap: space.md,
              }}
            >
              <Field label="Email">
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  placeholder="you@example.com"
                  placeholderTextColor={colors.muted}
                  style={inputStyle()}
                />
              </Field>
              <Field label="Password">
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  placeholder="••••••••"
                  placeholderTextColor={colors.muted}
                  style={inputStyle()}
                  onSubmitEditing={submit}
                />
              </Field>

              <Pressable
                onPress={submit}
                disabled={busy}
                style={{ borderRadius: radius.pill, overflow: "hidden", marginTop: space.sm, opacity: busy ? 0.7 : 1 }}
              >
                <LinearGradient
                  colors={gradients.primaryLit as unknown as readonly [string, string, ...string[]]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={{ paddingVertical: 14, alignItems: "center" }}
                >
                  {busy ? (
                    <ActivityIndicator color={colors.white} />
                  ) : (
                    <Text style={{ color: colors.white, fontWeight: "800", fontSize: 15, letterSpacing: 0.3 }}>Sign in</Text>
                  )}
                </LinearGradient>
              </Pressable>
            </View>
          </FadeIn>

          <View style={{ alignItems: "center", gap: 8 }}>
            <Link href="/(auth)/forgot" asChild>
              <Pressable hitSlop={10}>
                <Text style={{ color: colors.muted, fontWeight: "600", fontSize: 13 }}>
                  Forgot password?
                </Text>
              </Pressable>
            </Link>
            <Link href="/(auth)/signup" asChild>
              <Pressable hitSlop={10}>
                <Text style={{ color: colors.primary, fontWeight: "600", fontSize: 13 }}>
                  Got an invite code? Sign up →
                </Text>
              </Pressable>
            </Link>
            <Text style={{ textAlign: "center", color: colors.muted, fontSize: 12 }}>
              Use the same email your team owner invited you with.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const inputStyle = () => ({
  backgroundColor: colors.surface2,
  borderRadius: radius.lg,
  paddingHorizontal: 14,
  paddingVertical: 12,
  fontSize: 15,
  color: colors.text,
  borderWidth: 1,
  borderColor: colors.hairline,
});

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 11, color: colors.muted, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 }}>
        {label}
      </Text>
      {children}
    </View>
  );
}
