import React from "react";
import { Pressable, Text, View, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { colors } from "@/lib/theme";

/** Custom bottom tab bar — flat icons on a clean surface; the active tab gets a
 *  solid teal pill under the icon and a teal label. Each tap fires a tiny
 *  haptic for tactile feedback. */
export function GradientTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  // Filter out tabs hidden via `href: null`
  const visibleRoutes = state.routes.filter((route) => {
    const opts = descriptors[route.key].options as { href?: string | null | undefined };
    return opts.href !== null;
  });

  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: colors.card,
        borderTopColor: colors.hairline,
        borderTopWidth: 1,
        paddingTop: 8,
        paddingBottom: Math.max(insets.bottom, 8),
        paddingHorizontal: 4,
      }}
    >
      {visibleRoutes.map((route) => {
        const realIndex = state.routes.findIndex((r) => r.key === route.key);
        const isFocused = state.index === realIndex;
        const { options } = descriptors[route.key];
        const label = (options.title ?? route.name) as string;
        const Icon = options.tabBarIcon;

        const onPress = () => {
          if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
          const event = navigation.emit({
            type: "tabPress",
            target: route.key,
            canPreventDefault: true,
          });
          if (!isFocused && !event.defaultPrevented) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (navigation as any).navigate(route.name, route.params);
          }
        };

        return (
          <TabButton
            key={route.key}
            isFocused={isFocused}
            label={label}
            onPress={onPress}
            renderIcon={(color) => Icon ? Icon({ focused: isFocused, color, size: 22 }) : null}
          />
        );
      })}
    </View>
  );
}

function TabButton({
  isFocused, label, onPress, renderIcon,
}: {
  isFocused: boolean;
  label: string;
  onPress: () => void;
  renderIcon: (color: string) => React.ReactNode;
}) {
  const scale = useSharedValue(isFocused ? 1 : 0.92);
  React.useEffect(() => {
    scale.value = withSpring(isFocused ? 1 : 0.92, { damping: 16, stiffness: 220 });
  }, [isFocused, scale]);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable
      onPress={onPress}
      style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 4 }}
    >
      <Animated.View style={[{ alignItems: "center", gap: 3 }, animatedStyle]}>
        {isFocused ? (
          <View
            style={{
              width: 44, height: 30, borderRadius: 15,
              backgroundColor: colors.primary,
              alignItems: "center", justifyContent: "center",
            }}
          >
            {renderIcon("#ffffff")}
          </View>
        ) : (
          <View style={{ width: 44, height: 30, alignItems: "center", justifyContent: "center" }}>
            {renderIcon(colors.muted)}
          </View>
        )}
        <Text
          numberOfLines={1}
          style={{
            fontSize: 10,
            fontWeight: isFocused ? "800" : "600",
            color: isFocused ? colors.primary : colors.muted,
            letterSpacing: 0.3,
          }}
        >
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}
