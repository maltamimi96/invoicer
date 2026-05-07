import { useEffect, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LogOut, Bell, Building2, ChevronRight } from "lucide-react-native";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { ensureNotificationPermissions } from "@/lib/notifications";
import { useActiveBusiness } from "@/lib/active-business";
import { colors, radius, space } from "@/lib/theme";

export default function ProfileScreen() {
  const router = useRouter();
  const { role } = useActiveBusiness();
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["top", "left", "right"]}>
      <View style={{ padding: space.lg }}>
        <Text style={{ fontSize: 28, fontWeight: "700", color: colors.text, letterSpacing: -0.5 }}>
          Profile
        </Text>

        <View
          style={{
            backgroundColor: colors.card,
            borderRadius: radius.xl,
            padding: space.lg,
            marginTop: space.lg,
            borderWidth: 1,
            borderColor: colors.hairline,
            gap: space.md,
          }}
        >
          <Row label="Signed in as" value={email ?? "—"} />
          <View style={{ height: 1, backgroundColor: colors.hairline }} />
          <Row
            label="Job reminders"
            value={notifGranted === null ? "Checking…" : notifGranted ? "Enabled" : "Disabled — enable in Settings"}
            icon={<Bell size={16} color={colors.muted} />}
          />
        </View>

        {canEditBusiness && (
          <Pressable
            onPress={() => router.push("/settings/business" as never)}
            style={({ pressed }) => ({
              backgroundColor: colors.card,
              borderRadius: radius.xl,
              padding: space.lg,
              marginTop: space.md,
              borderWidth: 1,
              borderColor: colors.hairline,
              flexDirection: "row",
              alignItems: "center",
              gap: space.sm,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Building2 size={18} color={colors.text} />
            <Text style={{ flex: 1, color: colors.text, fontWeight: "600", fontSize: 15 }}>Business profile</Text>
            <ChevronRight size={16} color={colors.muted} />
          </Pressable>
        )}

        <Pressable
          onPress={() =>
            Alert.alert("Sign out?", "You'll need to sign in again to see your jobs.", [
              { text: "Cancel", style: "cancel" },
              { text: "Sign out", style: "destructive", onPress: signOut },
            ])
          }
          style={({ pressed }) => ({
            backgroundColor: colors.card,
            borderRadius: radius.pill,
            paddingVertical: 14,
            paddingHorizontal: space.lg,
            marginTop: space.xl,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: space.sm,
            borderWidth: 1,
            borderColor: colors.hairline,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <LogOut size={16} color={colors.text} />
          <Text style={{ color: colors.text, fontWeight: "600" }}>Sign out</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function Row({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 }}>
        {icon}
        <Text style={{ fontSize: 11, color: colors.muted, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 }}>
          {label}
        </Text>
      </View>
      <Text style={{ fontSize: 15, color: colors.text }}>{value}</Text>
    </View>
  );
}
