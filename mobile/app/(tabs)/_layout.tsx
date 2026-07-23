import { Tabs } from "expo-router";
import { Calendar, User, CheckSquare, Briefcase, Home } from "lucide-react-native";
import { colors } from "@/lib/theme";
import { useThemeMode } from "@/lib/theme-provider";
import { GradientTabBar } from "@/components/GradientTabBar";

/** The ADMIN app — owner / admin / editor / viewer.
 *
 *  Home · Sales · Tasks · Schedule · Profile, unchanged.
 *
 *  This used to be one navigator shared with workers, branching on role and
 *  hiding screens with `href: null`. Workers now have their own group at
 *  app/(worker)/, so nothing here needs to know about roles: a worker never
 *  mounts this layout at all. app/_layout.tsx decides which group to send
 *  someone to.
 */
export default function TabsLayout() {
  const { resolved } = useThemeMode();
  return (
    // key={resolved}: remounts only the admin tabs on a theme change so screens
    // re-read the mutated palette. Scoped to this group — the root Stack (and
    // thus worker↔admin routing) is never remounted.
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
          title: "Home",
          tabBarIcon: ({ color }) => <Home size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="sales"
        options={{
          title: "Sales",
          tabBarIcon: ({ color }) => <Briefcase size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          title: "Tasks",
          tabBarIcon: ({ color }) => <CheckSquare size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{
          title: "Schedule",
          tabBarIcon: ({ color }) => <Calendar size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color }) => <User size={20} color={color} />,
        }}
      />
    </Tabs>
  );
}
