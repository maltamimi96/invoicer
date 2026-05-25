import { useEffect, useState } from "react";
import { Alert, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LogOut, Bell, Building2, ChevronRight, Landmark, Palette, Sparkles } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { ensureNotificationPermissions } from "@/lib/notifications";
import { useActiveBusiness } from "@/lib/active-business";
import { colors, gradients, radius, space } from "@/lib/theme";
import { FadeIn } from "@/components/FadeIn";
import { AnimatedPress } from "@/components/AnimatedPress";
import { PatternBackground } from "@/components/PatternBackground";

export default function ProfileScreen() {
  const router = useRouter();
  const { active, role } = useActiveBusiness();
  const canEditBusiness = role === "owner" || role === "admin";
  const [email, setEmail] = useState<string | null>(null);
  const [notifGranted, setNotifGranted] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
    ensureNotificationPermissions().then(setNotifGranted).catch(() => setNotifGranted(false));
  }, []);

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) Alert.alert("Couldn't sign out", error.message);
  };

  const initials = email?.slice(0, 2).toUpperCase() ?? "??";

  const settingsItems: Array<{
    href: string; label: string; icon: React.ReactNode; gradient: keyof typeof gradients;
  }> = [
    // Admin-only business config — hidden from workers/editors/viewers.
    ...(canEditBusiness ? [
      { href: "/settings/business", label: "Business profile", icon: <Building2 size={18} color="#fff" />, gradient: "primary" as const },
      { href: "/settings/bank",     label: "Bank details",     icon: <Landmark  size={18} color="#fff" />, gradient: "emerald" as const },
    ] : []),
    // Available to everyone (incl. workers) — just appearance.
    { href: "/settings/appearance", label: "Appearance", icon: <Palette size={18} color="#fff" />, gradient: "violet" as const },
    ...(canEditBusiness ? [
      { href: "/settings/advanced", label: "Advanced", icon: <Sparkles size={18} color="#fff" />, gradient: "dusk" as const },
    ] : []),
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: space.xxl }}>
        {/* Avatar + email hero */}
        <FadeIn>
          <View style={{ borderRadius: radius.xxl, overflow: "hidden" }}>
            <LinearGradient
              colors={gradients.dusk as unknown as readonly [string, string, ...string[]]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={{ padding: space.lg + 4, gap: space.md, alignItems: "center", minHeight: 160 }}
            >
              <PatternBackground variant="dots" color="#fff" opacity={0.13} />
              <View style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "rgba(255,255,255,0.35)" }}>
                <Text style={{ fontSize: 28, fontWeight: "800", color: "#fff" }}>{initials}</Text>
              </View>
              <View style={{ alignItems: "center" }}>
                <Text style={{ fontSize: 16, fontWeight: "700", color: "#fff" }} numberOfLines={1}>{email ?? "—"}</Text>
                {active && (
                  <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.85)", marginTop: 4 }}>
                    {active.name} · {role}
                  </Text>
                )}
              </View>
            </LinearGradient>
          </View>
        </FadeIn>

        {/* Notifications row */}
        <FadeIn delay={60}>
          <View style={{ padding: space.md, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.hairline, flexDirection: "row", alignItems: "center", gap: space.sm }}>
            <View style={{ width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" }}>
              <Bell size={18} color={colors.primaryDeep} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: colors.text }}>Notifications</Text>
              <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                {notifGranted === null ? "Checking…" : notifGranted ? "Job reminders + morning briefing on" : "Disabled — enable in Settings"}
              </Text>
            </View>
          </View>
        </FadeIn>

        {/* Settings tiles */}
        {settingsItems.map((item, idx) => (
          <FadeIn key={item.href} delay={120 + idx * 50}>
            <AnimatedPress
              onPress={() => router.push(item.href as never)}
              style={{
                flexDirection: "row", alignItems: "center", gap: space.md,
                padding: space.md, borderRadius: radius.lg,
                backgroundColor: colors.card,
                borderWidth: 1, borderColor: colors.hairline,
              }}
            >
              <LinearGradient
                colors={gradients[item.gradient] as unknown as readonly [string, string, ...string[]]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={{ width: 44, height: 44, borderRadius: radius.lg, alignItems: "center", justifyContent: "center" }}
              >
                {item.icon}
              </LinearGradient>
              <Text style={{ flex: 1, color: colors.text, fontWeight: "700", fontSize: 15 }}>{item.label}</Text>
              <ChevronRight size={16} color={colors.muted} />
            </AnimatedPress>
          </FadeIn>
        ))}

        {/* Sign out */}
        <FadeIn delay={120 + settingsItems.length * 50 + 50}>
          <AnimatedPress
            onPress={() =>
              Alert.alert("Sign out?", "You'll need to sign in again to see your jobs.", [
                { text: "Cancel", style: "cancel" },
                { text: "Sign out", style: "destructive", onPress: signOut },
              ])
            }
            style={{
              backgroundColor: colors.card,
              borderRadius: radius.pill,
              paddingVertical: 14,
              paddingHorizontal: space.lg,
              marginTop: space.md,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: space.sm,
              borderWidth: 1,
              borderColor: colors.hairline,
            }}
          >
            <LogOut size={16} color={colors.text} />
            <Text style={{ color: colors.text, fontWeight: "700" }}>Sign out</Text>
          </AnimatedPress>
        </FadeIn>
      </ScrollView>
    </SafeAreaView>
  );
}

