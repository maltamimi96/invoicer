import { Tabs } from "expo-router";
import { Wrench, Calendar, User, CheckSquare, Briefcase, Home } from "lucide-react-native";
import { colors } from "@/lib/theme";
import { useActiveBusiness } from "@/lib/active-business";
import { isWorker } from "@/lib/permissions";
import { GradientTabBar } from "@/components/GradientTabBar";

/** Role-aware tab bar.
 *  - Workers: Home (jobs) · Tasks · Schedule · Profile (4 tabs).
 *  - Owners + admin/editor/viewer: Home (dashboard) · Sales · Tasks · Schedule · Profile (5 tabs).
 *  Tabs are always registered; href: null hides them from users who
 *  shouldn't see them — keeps the file-based routing simple. */
export default function TabsLayout() {
  const { role, loading } = useActiveBusiness();
  const worker = !loading && isWorker(role);

  return (
    <Tabs
      tabBar={(props) => <GradientTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.canvas },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: worker ? "Jobs" : "Home",
          tabBarIcon: ({ color }) => (worker
            ? <Wrench size={20} color={color} />
            : <Home   size={20} color={color} />),
        }}
      />
      <Tabs.Screen
        name="sales"
        options={{
          title: "Sales",
          tabBarIcon: ({ color }) => <Briefcase size={20} color={color} />,
          href: worker ? null : "/sales",
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
