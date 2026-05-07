import { ScrollView, Text, View, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Users, UserPlus, FileCheck, FileText, ChevronRight, ClipboardList, Repeat, TrendingUp, Bot } from "lucide-react-native";
import { colors, radius, space } from "@/lib/theme";
import { BusinessSwitcher } from "@/components/BusinessSwitcher";
import { useActiveBusiness } from "@/lib/active-business";

interface Section {
  href:    string;
  icon:    React.ReactNode;
  label:   string;
  hint:    string;
  bg:      string;
  fg:      string;
}

function SectionList({ sections, onPress }: { sections: Section[]; onPress: (href: string) => void }) {
  return (
    <View style={{ gap: space.sm }}>
      {sections.map((s) => (
        <Pressable
          key={s.href}
          onPress={() => onPress(s.href)}
          style={({ pressed }) => ({
            flexDirection: "row", alignItems: "center", gap: space.md,
            padding: space.md, borderRadius: radius.lg,
            backgroundColor: pressed ? colors.muted : colors.card,
            borderWidth: 1, borderColor: colors.hairline,
          })}
        >
          <View style={{ width: 44, height: 44, borderRadius: radius.lg, backgroundColor: s.bg, alignItems: "center", justifyContent: "center" }}>
            {s.icon}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 16, fontWeight: "600", color: colors.text }}>{s.label}</Text>
            <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>{s.hint}</Text>
          </View>
          <ChevronRight size={18} color={colors.muted} />
        </Pressable>
      ))}
    </View>
  );
}

/** Sales hub — entry point to leads / customers / quotes / invoices.
 *  Each card opens a stack-based list screen (mobile/app/<entity>/index.tsx). */
export default function SalesHub() {
  const router = useRouter();
  const { active, businesses, role, switchTo } = useActiveBusiness();

  const sales: Section[] = [
    { href: "/leads",     label: "Leads",     hint: "Track new opportunities",       icon: <UserPlus size={20} color="#1d4ed8" />, bg: "#dbeafe", fg: "#1d4ed8" },
    { href: "/customers", label: "Customers", hint: "Manage your client base",       icon: <Users    size={20} color="#0f766e" />, bg: "#ccfbf1", fg: "#0f766e" },
    { href: "/quotes",    label: "Quotes",    hint: "Send estimates",                icon: <FileCheck size={20} color="#7c3aed" />, bg: "#ede9fe", fg: "#7c3aed" },
    { href: "/invoices",  label: "Invoices",  hint: "Bill and collect",              icon: <FileText size={20} color="#16a34a" />, bg: "#dcfce7", fg: "#16a34a" },
  ];
  const ops: Section[] = [
    { href: "/reports",   label: "Site reports", hint: "Inspection & condition reports", icon: <ClipboardList size={20} color="#b45309" />, bg: "#fef3c7", fg: "#b45309" },
    { href: "/recurring", label: "Recurring jobs", hint: "Auto-scheduled work",          icon: <Repeat size={20} color="#7c3aed" />, bg: "#ede9fe", fg: "#7c3aed" },
    { href: "/analytics", label: "Analytics",    hint: "Revenue, leads, quotes won",     icon: <TrendingUp size={20} color={colors.primary} />, bg: colors.primarySoft, fg: colors.primary },
    { href: "/agents",    label: "Agents",       hint: "Toggle automations on/off",      icon: <Bot size={20} color="#16a34a" />, bg: "#dcfce7", fg: "#16a34a" },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["top", "left", "right"]}>
      <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm }}>
        {active && <BusinessSwitcher active={active} businesses={businesses} role={role} onSwitch={switchTo} />}
      </View>

      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md }}>
        <View>
          <Text style={{ fontSize: 22, fontWeight: "700", color: colors.text, letterSpacing: -0.4 }}>Sales</Text>
          <Text style={{ fontSize: 13, color: colors.muted, marginTop: 4 }}>Pick a section to manage.</Text>
        </View>

        <SectionList sections={sales} onPress={(href) => router.push(href as never)} />

        <Text style={{ fontSize: 11, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: "700", marginTop: space.sm }}>
          Operations
        </Text>
        <SectionList sections={ops} onPress={(href) => router.push(href as never)} />
      </ScrollView>
    </SafeAreaView>
  );
}
