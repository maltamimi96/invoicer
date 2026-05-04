import { Tabs } from "expo-router";
import { Wrench, Calendar, User, CheckSquare } from "lucide-react-native";
import { colors } from "@/lib/theme";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.hairline,
          height: 64,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
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
