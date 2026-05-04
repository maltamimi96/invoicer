import { useState } from "react";
import {
  Alert, KeyboardAvoidingView, Platform, Pressable,
  ScrollView, Text, TextInput, View, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import { colors, radius, space } from "@/lib/theme";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email.trim() || !password) {
      Alert.alert("Missing details", "Enter your email and password.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    setBusy(false);
    if (error) Alert.alert("Couldn't sign in", error.message);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: space.xl }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ marginBottom: space.xxl }}>
            <Text style={{ fontSize: 36, fontWeight: "700", color: colors.text, letterSpacing: -0.5 }}>
              Connected Hub
            </Text>
            <Text style={{ fontSize: 14, color: colors.muted, marginTop: 6 }}>
              Sign in to see your assigned jobs.
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
            <Field label="Email">
              <TextInput
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                placeholder="you@example.com"
                placeholderTextColor={colors.muted}
                style={inputStyle}
              />
            </Field>
            <Field label="Password">
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholder="••••••••"
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
                <Text style={{ color: colors.white, fontWeight: "700", fontSize: 15 }}>Sign in</Text>
              )}
            </Pressable>
          </View>

          <Text style={{ marginTop: space.xl, textAlign: "center", color: colors.muted, fontSize: 12 }}>
            Use the same email your team owner invited you with.
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
