import React from "react";
import { Pressable, Text, View } from "react-native";
import { Sun, Moon, Smartphone } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";
import { colors, radius, space } from "@/lib/theme";
import { useThemeMode, ThemeMode } from "@/lib/theme-provider";

const MODES: Array<{ id: ThemeMode; label: string; Icon: typeof Sun }> = [
  { id: "system", label: "System", Icon: Smartphone },
  { id: "light",  label: "Light",  Icon: Sun },
  { id: "dark",   label: "Dark",   Icon: Moon },
];

/**
 * Reachable theme control, two shapes over the same `useThemeMode()` engine:
 *
 *  - `segmented` — the System / Light / Dark row (Profile + Settings).
 *  - `icon`      — one compact button that cycles system→light→dark→system,
 *                  showing the current mode's glyph. For the tight worker
 *                  header, where there's no settings screen to reach.
 *
 * Colours are read at render, so it survives a dark-mode swap.
 */
export function ThemeToggle({ variant = "segmented" }: { variant?: "segmented" | "icon" }) {
  const { mode, setMode } = useThemeMode();

  if (variant === "icon") {
    const current = MODES.find((m) => m.id === mode) ?? MODES[0];
    const { Icon } = current;
    const next = () => {
      if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
      const i = MODES.findIndex((m) => m.id === mode);
      setMode(MODES[(i + 1) % MODES.length].id);
    };
    return (
      <Pressable
        onPress={next}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={`Theme: ${current.label}. Tap to change.`}
        style={({ pressed }) => ({
          width: 36, height: 36, borderRadius: 18,
          alignItems: "center", justifyContent: "center",
          backgroundColor: colors.card,
          borderWidth: 1, borderColor: colors.hairline,
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <Icon size={16} color={colors.muted} />
      </Pressable>
    );
  }

  return (
    <View
      style={{
        flexDirection: "row", gap: 4,
        padding: 4, borderRadius: radius.lg,
        backgroundColor: colors.surface2,
        borderWidth: 1, borderColor: colors.hairline,
      }}
    >
      {MODES.map(({ id, label, Icon }) => {
        const selected = id === mode;
        return (
          <Pressable
            key={id}
            onPress={() => setMode(id)}
            style={({ pressed }) => ({
              flex: 1,
              flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
              paddingVertical: 10, borderRadius: radius.md,
              backgroundColor: selected ? colors.card : pressed ? colors.hairline : "transparent",
              borderWidth: selected ? 1 : 0,
              borderColor: colors.hairline,
            })}
          >
            <Icon size={16} color={selected ? colors.text : colors.muted} />
            <Text style={{ fontSize: 13, fontWeight: "700", color: selected ? colors.text : colors.muted }}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
