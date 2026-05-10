import { useState } from "react";
import { Modal, Pressable, ScrollView, Text, View, Image } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { ChevronDown, Check, Building2 } from "lucide-react-native";
import { colors, gradients, radius, space } from "@/lib/theme";
import type { MobileBusiness } from "@/lib/active-business";
import { ROLE_LABELS, type Role } from "@/lib/permissions";

interface Props {
  active: MobileBusiness | null;
  businesses: MobileBusiness[];
  role: Role;
  onSwitch: (businessId: string) => void | Promise<void>;
}

/** Top-of-screen pill showing the active business + role with a tap-to-switch
 *  modal listing every business the user has access to. */
export function BusinessSwitcher({ active, businesses, role, onSwitch }: Props) {
  const [open, setOpen] = useState(false);

  if (!active) return null;

  const initials = active.name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");

  return (
    <>
      <Pressable
        onPress={() => businesses.length > 1 && setOpen(true)}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: space.sm,
          padding: space.sm,
          borderRadius: radius.lg,
          backgroundColor: pressed ? colors.muted : "transparent",
          opacity: pressed ? 0.85 : 1,
        })}
      >
        {active.logo_url ? (
          <Image source={{ uri: active.logo_url }} style={{ width: 34, height: 34, borderRadius: radius.md }} />
        ) : (
          <LinearGradient
            colors={gradients.primary as unknown as readonly [string, string, ...string[]]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={{
              width: 34, height: 34, borderRadius: radius.md,
              alignItems: "center", justifyContent: "center",
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}>{initials || "?"}</Text>
          </LinearGradient>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: "600", color: colors.text }}>{active.name}</Text>
          <Text style={{ fontSize: 11, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.6 }}>
            {ROLE_LABELS[role]}
          </Text>
        </View>
        {businesses.length > 1 && <ChevronDown size={16} color={colors.muted} />}
      </Pressable>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)" }} onPress={() => setOpen(false)}>
          <View style={{ marginTop: "auto", backgroundColor: colors.card, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: space.lg, gap: space.md, maxHeight: "70%" }}>
            <Text style={{ fontSize: 17, fontWeight: "700", color: colors.text }}>Switch business</Text>
            <ScrollView>
              {businesses.map((b) => {
                const selected = b.id === active.id;
                const init = b.name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
                return (
                  <Pressable
                    key={b.id}
                    onPress={async () => { await onSwitch(b.id); setOpen(false); }}
                    style={({ pressed }) => ({
                      flexDirection: "row", alignItems: "center", gap: space.md,
                      padding: space.md, borderRadius: radius.lg,
                      backgroundColor: selected ? colors.primarySoft : pressed ? colors.muted : "transparent",
                    })}
                  >
                    {b.logo_url ? (
                      <Image source={{ uri: b.logo_url }} style={{ width: 38, height: 38, borderRadius: radius.md }} />
                    ) : (
                      <LinearGradient
                        colors={gradients.primary as unknown as readonly [string, string, ...string[]]}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                        style={{
                          width: 38, height: 38, borderRadius: radius.md,
                          alignItems: "center", justifyContent: "center",
                        }}
                      >
                        <Text style={{ color: "#fff", fontWeight: "800", fontSize: 14 }}>{init || "?"}</Text>
                      </LinearGradient>
                    )}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: "600", color: colors.text }}>{b.name}</Text>
                      <Text style={{ fontSize: 11, color: colors.muted }}>{b.currency ?? "AUD"}</Text>
                    </View>
                    {selected && <Check size={18} color={colors.primary} />}
                  </Pressable>
                );
              })}
              {businesses.length === 1 && (
                <View style={{ alignItems: "center", padding: space.lg, gap: space.sm }}>
                  <Building2 size={28} color={colors.muted} />
                  <Text style={{ fontSize: 13, color: colors.muted, textAlign: "center" }}>
                    You only have one business. Accept another invite or create a new one to switch.
                  </Text>
                </View>
              )}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}
