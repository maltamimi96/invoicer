import { useState } from "react";
import {
  Alert, KeyboardAvoidingView, Platform, Pressable,
  ScrollView, Text, TextInput, View, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link, useRouter } from "expo-router";
import { ArrowLeft, CheckCircle2, AlertCircle } from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import { colors, radius, space } from "@/lib/theme";

type Stage = "form" | "joining" | "done";

interface InvitePreview {
  business_id: string;
  business_name: string;
  role: string;
  email: string;
}

export default function SignUp() {
  const router = useRouter();
  const [email,    setEmail]    = useState("");
  const [code,     setCode]     = useState("");
  const [password, setPassword] = useState("");
  const [busy,     setBusy]     = useState(false);
  const [preview,  setPreview]  = useState<InvitePreview | null>(null);
  const [stage,    setStage]    = useState<Stage>("form");

  // Look up the invite as soon as the user has entered a 6+ char code.
  // Surfaces the business name so they confirm before submitting.
  const verifyCode = async (next: string) => {
    setCode(next.toUpperCase());
    setPreview(null);
    if (next.trim().length < 6) return;
    const { data, error } = await supabase.rpc("preview_invite", { p_token: next.trim().toUpperCase() });
    if (error) return;
    const row = (data as InvitePreview[])?.[0];
    if (row) setPreview(row);
  };

  const submit = async () => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanCode  = code.trim().toUpperCase();

    if (!cleanEmail || !password || !cleanCode) {
      Alert.alert("Missing details", "Email, password, and invite code are required.");
      return;
    }
    if (password.length < 6) {
      Alert.alert("Password too short", "At least 6 characters.");
      return;
    }
    if (preview && preview.email.toLowerCase() !== cleanEmail) {
      Alert.alert(
        "Email doesn't match the invite",
        `This code was sent to ${preview.email}. Use that email — or ask your team owner to send a fresh invite to ${cleanEmail}.`
      );
      return;
    }

    setStage("joining");
    setBusy(true);

    // 1. Create the auth user
    const signUpRes = await supabase.auth.signUp({
      email: cleanEmail,
      password,
    });
    if (signUpRes.error) {
      // If the user already exists, try signing them in and proceeding to redeem.
      if (/already.*registered|user.*exists/i.test(signUpRes.error.message)) {
        const signIn = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
        if (signIn.error) {
          setBusy(false); setStage("form");
          return Alert.alert("Account exists",
            "An Invoicer account with this email already exists. Sign in with your existing password to redeem the code.");
        }
      } else {
        setBusy(false); setStage("form");
        return Alert.alert("Couldn't sign up", signUpRes.error.message);
      }
    }

    // 2. Redeem the invite — links business_members.user_id to the new auth user.
    const redeemRes = await supabase.rpc("redeem_invite", { p_token: cleanCode });
    if (redeemRes.error) {
      setBusy(false); setStage("form");
      return Alert.alert("Couldn't redeem invite", redeemRes.error.message);
    }

    // 3. Light up any existing member_profile with this email so old work-order
    //    assignments resolve to the new auth user. PostgrestFilterBuilder
    //    is thenable but doesn't expose .catch — use try/catch.
    try { await supabase.rpc("link_my_member_profile"); } catch { /* non-fatal */ }

    setBusy(false);
    setStage("done");
    setTimeout(() => router.replace("/(tabs)"), 900);
  };

  if (stage === "done") {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: space.xl }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center", marginBottom: space.lg }}>
            <CheckCircle2 size={32} color={colors.primary} />
          </View>
          <Text style={{ fontSize: 22, fontWeight: "700", color: colors.text, letterSpacing: -0.4 }}>
            You&apos;re in.
          </Text>
          <Text style={{ marginTop: 8, fontSize: 14, color: colors.muted, textAlign: "center" }}>
            Welcome to {preview?.business_name ?? "the team"}.
          </Text>
          <ActivityIndicator color={colors.primary} style={{ marginTop: space.lg }} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, padding: space.xl }}
          keyboardShouldPersistTaps="handled"
        >
          <Link href="/(auth)/login" asChild>
            <Pressable hitSlop={10} style={{ alignSelf: "flex-start", padding: 4, marginBottom: space.lg }}>
              <ArrowLeft size={20} color={colors.text} />
            </Pressable>
          </Link>

          <View style={{ marginBottom: space.xxl }}>
            <Text style={{ fontSize: 28, fontWeight: "700", color: colors.text, letterSpacing: -0.5 }}>
              Join your team
            </Text>
            <Text style={{ fontSize: 14, color: colors.muted, marginTop: 6 }}>
              Enter the invite code from the email your owner sent.
            </Text>
          </View>

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
            <Field label="Invite code">
              <TextInput
                value={code}
                onChangeText={verifyCode}
                autoCapitalize="characters"
                autoCorrect={false}
                placeholder="A1B2C3D4"
                placeholderTextColor={colors.muted}
                style={{ ...inputStyle, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", letterSpacing: 4, fontSize: 18 }}
                maxLength={12}
              />
              {/* Live preview pill */}
              {preview && (
                <View style={{
                  flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8,
                  padding: 10, borderRadius: radius.md, backgroundColor: colors.primarySoft,
                }}>
                  <CheckCircle2 size={16} color={colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: "600", color: colors.primaryText }}>
                      Joining {preview.business_name}
                    </Text>
                    <Text style={{ fontSize: 11, color: colors.primaryText, opacity: 0.8 }}>
                      as {preview.role} · invite for {preview.email}
                    </Text>
                  </View>
                </View>
              )}
              {code.trim().length >= 6 && !preview && (
                <View style={{
                  flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8,
                  padding: 10, borderRadius: radius.md, backgroundColor: "#fef2f2",
                }}>
                  <AlertCircle size={16} color="#b91c1c" />
                  <Text style={{ fontSize: 12, color: "#7f1d1d", flex: 1 }}>
                    Code not recognised. Check the email or ask your owner to resend.
                  </Text>
                </View>
              )}
            </Field>

            <Field label="Email">
              <TextInput
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                placeholder={preview?.email ?? "you@example.com"}
                placeholderTextColor={colors.muted}
                style={inputStyle}
              />
            </Field>

            <Field label="Choose a password">
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholder="At least 6 characters"
                placeholderTextColor={colors.muted}
                style={inputStyle}
                onSubmitEditing={submit}
              />
            </Field>

            <Pressable
              onPress={submit}
              disabled={busy}
              style={({ pressed }) => ({
                backgroundColor: colors.primary,
                borderRadius: radius.pill,
                paddingVertical: 14,
                alignItems: "center",
                marginTop: space.sm,
                opacity: pressed || busy ? 0.85 : 1,
              })}
            >
              {busy ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={{ color: colors.white, fontWeight: "700", fontSize: 15 }}>
                  Create account &amp; join
                </Text>
              )}
            </Pressable>
          </View>

          <Text style={{ marginTop: space.xl, textAlign: "center", color: colors.muted, fontSize: 12 }}>
            Already have an account? <Link href="/(auth)/login" asChild>
              <Text style={{ color: colors.primary, fontWeight: "600" }}>Sign in</Text>
            </Link>
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const inputStyle = {
  backgroundColor: "#fafaf3",
  borderRadius: radius.lg,
  paddingHorizontal: 14,
  paddingVertical: 12,
  fontSize: 15,
  color: colors.text,
  borderWidth: 1,
  borderColor: colors.hairline,
};

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
