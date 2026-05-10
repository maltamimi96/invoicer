import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { ArrowLeft, Key, Webhook, Mail, ExternalLink, Sparkles, Wrench } from "lucide-react-native";
import { colors, radius, space } from "@/lib/theme";

/** Power-user settings landing page. API keys, webhooks, email config,
 *  and Smart Organise need privileged server endpoints (mint/hash secrets,
 *  IMAP credential storage, cross-entity dedupe). For now we surface them
 *  here with deep links to the web app. */
export default function AdvancedSettings() {
  const router = useRouter();
  const base = process.env.EXPO_PUBLIC_APP_URL ?? "https://kireihq.com";

  const items: Array<{
    title:    string;
    hint:     string;
    icon:     React.ReactNode;
    href:     string;
  }> = [
    { title: "API keys",        hint: "Mint and revoke keys for integrations",       icon: <Key      size={20} color="#1d4ed8" />, href: `${base}/settings/api-keys` },
    { title: "Webhooks",        hint: "Outgoing events to Zapier, n8n, your stack",  icon: <Webhook  size={20} color="#7c3aed" />, href: `${base}/settings/webhooks` },
    { title: "Email config",    hint: "IMAP scanning to auto-import invoices/leads", icon: <Mail     size={20} color="#0f766e" />, href: `${base}/settings/email-config` },
    { title: "Smart Organise",  hint: "Cross-entity cleanup: dupes, archive stale",  icon: <Wrench   size={20} color="#b45309" />, href: `${base}/settings/cleanup` },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["top", "left", "right"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.sm, gap: space.sm }}>
        <Pressable onPress={() => router.back()} hitSlop={10}><ArrowLeft size={22} color={colors.text} /></Pressable>
        <Sparkles size={18} color={colors.text} />
        <Text style={{ fontSize: 18, fontWeight: "700", color: colors.text }}>Advanced</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md }}>
        <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 18 }}>
          These power-user areas use privileged endpoints (secret hashing, IMAP creds, bulk operations) and live on the web app. Tap to open in your browser.
        </Text>

        <View style={{ gap: space.sm }}>
          {items.map((item) => (
            <Pressable
              key={item.title}
              onPress={() => Linking.openURL(item.href)}
              style={({ pressed }) => ({
                flexDirection: "row", alignItems: "center", gap: space.md,
                padding: space.md, borderRadius: radius.lg,
                backgroundColor: pressed ? colors.muted : colors.card,
                borderWidth: 1, borderColor: colors.hairline,
              })}
            >
              <View style={{ width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.muted + "22", alignItems: "center", justifyContent: "center" }}>
                {item.icon}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 15, fontWeight: "600", color: colors.text }}>{item.title}</Text>
                <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>{item.hint}</Text>
              </View>
              <ExternalLink size={16} color={colors.muted} />
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
