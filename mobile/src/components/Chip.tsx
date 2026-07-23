import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { colors, radius } from "@/lib/theme";

/**
 * A pill filter chip: selected = solid teal fill, idle = white + hairline.
 * Fitness-app day/filter-row vocabulary. Live colours at render.
 */
export function Chip({
  label,
  selected,
  onPress,
  count,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  count?: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: radius.pill,
        backgroundColor: selected ? colors.primary : colors.card,
        borderWidth: 1,
        borderColor: selected ? colors.primary : colors.hairline,
        opacity: pressed ? 0.9 : 1,
      })}
    >
      <Text style={{ fontSize: 13, fontWeight: "700", color: selected ? "#ffffff" : colors.text }}>{label}</Text>
      {typeof count === "number" && (
        <View
          style={{
            minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5,
            alignItems: "center", justifyContent: "center",
            backgroundColor: selected ? "rgba(255,255,255,0.25)" : colors.surface2,
          }}
        >
          <Text style={{ fontSize: 10.5, fontWeight: "800", color: selected ? "#ffffff" : colors.muted }}>{count}</Text>
        </View>
      )}
    </Pressable>
  );
}

/** A horizontally-scrolling row of day cells with a big number + short weekday.
 *  Selected cell fills teal. Used on Schedule and the worker Jobs header. */
export function DayChips({
  days,
  selectedKey,
  onSelect,
}: {
  days: Array<{ key: string; weekday: string; day: string; count?: number }>;
  selectedKey: string;
  onSelect: (key: string) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8, paddingHorizontal: 2 }}
    >
      {days.map((d) => {
        const selected = d.key === selectedKey;
        return (
          <Pressable
            key={d.key}
            onPress={() => onSelect(d.key)}
            style={({ pressed }) => ({
              width: 52,
              paddingVertical: 10,
              borderRadius: radius.lg,
              alignItems: "center",
              gap: 2,
              backgroundColor: selected ? colors.primary : colors.card,
              borderWidth: 1,
              borderColor: selected ? colors.primary : colors.hairline,
              opacity: pressed ? 0.9 : 1,
            })}
          >
            <Text style={{ fontSize: 10, fontWeight: "700", letterSpacing: 0.4, color: selected ? "rgba(255,255,255,0.85)" : colors.muted }}>
              {d.weekday}
            </Text>
            <Text style={{ fontSize: 16, fontWeight: "800", color: selected ? "#ffffff" : colors.text }}>{d.day}</Text>
            {typeof d.count === "number" && d.count > 0 ? (
              <View
                style={{
                  width: 5, height: 5, borderRadius: 3,
                  backgroundColor: selected ? "#ffffff" : colors.primary,
                }}
              />
            ) : (
              <View style={{ height: 5 }} />
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
