import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { LogOut } from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import { colors, space } from "@/lib/theme";

/**
 * The worker's only chrome.
 *
 * Workers get two tabs (Jobs, Schedule) and no Profile screen, so sign-out has
 * to live somewhere — it's here. Deliberately minimal: who you are, which
 * business, and a way out. No settings, no switcher unless there's genuinely
 * more than one business to switch to.
 *
 * Styles are a function, not a module-scope const: `colors` is MUTATED in place
 * by applyTheme(), so a const captured at import time freezes the light palette
 * and never updates on a dark-mode swap. That trap is documented in CLAUDE.md
 * and it is exactly what broke the worker's job screen in dark mode.
 */
export function WorkerHeader({
  businessName,
  workerName,
}: {
  businessName?: string | null;
  workerName?: string | null;
}) {
  const [busy, setBusy] = useState(false);

  const signOut = () => {
    Alert.alert("Sign out?", "You'll need to sign in again to see your jobs.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          const { error } = await supabase.auth.signOut();
          setBusy(false);
          if (error) Alert.alert("Couldn't sign out", error.message);
        },
      },
    ]);
  };

  return (
    <View style={row()}>
      <View style={{ flex: 1, minWidth: 0 }}>
        {workerName ? <Text style={name()} numberOfLines={1}>{workerName}</Text> : null}
        {businessName ? <Text style={biz()} numberOfLines={1}>{businessName}</Text> : null}
      </View>

      <Pressable
        onPress={signOut}
        disabled={busy}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Sign out"
        style={({ pressed }) => [signOutBtn(), pressed && { opacity: 0.6 }]}
      >
        <LogOut size={16} color={colors.muted} />
      </Pressable>
    </View>
  );
}

const row = () => ({
  flexDirection: "row" as const,
  alignItems: "center" as const,
  gap: space.sm,
  paddingTop: space.sm,
  paddingBottom: space.xs,
});

const name = () => ({
  fontSize: 15,
  fontWeight: "700" as const,
  color: colors.text,
});

const biz = () => ({
  fontSize: 12,
  color: colors.muted,
  marginTop: 1,
});

const signOutBtn = () => ({
  width: 36,
  height: 36,
  borderRadius: 18,
  alignItems: "center" as const,
  justifyContent: "center" as const,
  backgroundColor: colors.card,
  borderWidth: 1,
  borderColor: colors.hairline,
});
