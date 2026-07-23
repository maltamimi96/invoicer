import { Tabs } from "expo-router";
import { Wrench, Calendar } from "lucide-react-native";
import { colors } from "@/lib/theme";
import { useThemeMode } from "@/lib/theme-provider";
import { GradientTabBar } from "@/components/GradientTabBar";

/**
 * The worker app. A separate route group from (tabs) on purpose.
 *
 * The previous approach kept ONE tab navigator and hid screens with
 * `href: null`. That only removes the button — the routes stay registered, so
 * Sales/Tasks/Profile were still mounted, still reachable programmatically, and
 * still had to be defended with a router guard. Two roles sharing one navigator
 * meant every screen had to ask "am I a worker?".
 *
 * Here the worker navigator contains two screens and nothing else. There is no
 * Sales route to hide, because it isn't in this group. The admin UI in (tabs)
 * is untouched and no longer branches on role at all.
 *
 * Routing between the two groups happens once, in app/_layout.tsx.
 */
export default function WorkerLayout() {
  const { resolved } = useThemeMode();
  return (
    // key={resolved}: remounts only THIS group's tabs on a theme change so the
    // worker's screens re-read the mutated palette. Scoped to the group, so it
    // never touches worker↔admin routing (that lives in the root Stack).
    <Tabs
      key={resolved}
      tabBar={(props) => <GradientTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.canvas },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Jobs",
          tabBarIcon: ({ color }) => <Wrench size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{
          title: "Schedule",
          tabBarIcon: ({ color }) => <Calendar size={20} color={color} />,
        }}
      />
    </Tabs>
  );
}
