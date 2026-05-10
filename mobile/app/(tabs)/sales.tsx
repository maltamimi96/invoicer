import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Users, UserPlus, FileCheck, FileText, ChevronRight, ClipboardList, Repeat, TrendingUp, Bot, Sparkles, Package, Briefcase, MessageSquare } from "lucide-react-native";
import { colors, gradients, GradientName, radius, space } from "@/lib/theme";
import { BusinessSwitcher } from "@/components/BusinessSwitcher";
import { useActiveBusiness } from "@/lib/active-business";
import { AnimatedPress } from "@/components/AnimatedPress";
import { FadeIn } from "@/components/FadeIn";

interface Section {
  href:     string;
  icon:     React.ReactNode;
  label:    string;
  hint:     string;
  gradient: GradientName;
}

function SectionList({ sections, onPress, baseDelay = 0 }: { sections: Section[]; onPress: (href: string) => void; baseDelay?: number }) {
  return (
    <View style={{ gap: space.sm }}>
      {sections.map((s, idx) => (
        <FadeIn key={s.href} delay={baseDelay + idx * 50}>
          <AnimatedPress
            onPress={() => onPress(s.href)}
            style={{
              flexDirection: "row", alignItems: "center", gap: space.md,
              padding: space.md, borderRadius: radius.lg,
              backgroundColor: colors.card,
              borderWidth: 1, borderColor: colors.hairline,
            }}
          >
            <LinearGradient
              colors={gradients[s.gradient] as unknown as readonly [string, string, ...string[]]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={{
                width: 46, height: 46, borderRadius: radius.lg,
                alignItems: "center", justifyContent: "center",
              }}
            >
              {s.icon}
            </LinearGradient>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 16, fontWeight: "700", color: colors.text }}>{s.label}</Text>
              <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>{s.hint}</Text>
            </View>
            <ChevronRight size={18} color={colors.muted} />
          </AnimatedPress>
        </FadeIn>
      ))}
    </View>
  );
}

/** Sales hub — entry point to leads / customers / quotes / invoices.
 *  Gradient icon tiles + staggered fade-in. */
export default function SalesHub() {
  const router = useRouter();
  const { active, businesses, role, switchTo } = useActiveBusiness();

  const sales: Section[] = [
    { href: "/leads",     label: "Leads",     hint: "Track new opportunities",        icon: <UserPlus  size={22} color="#fff" />, gradient: "blue"   },
    { href: "/customers", label: "Customers", hint: "Manage your client base",        icon: <Users     size={22} color="#fff" />, gradient: "primary"},
    { href: "/quotes",    label: "Quotes",    hint: "Send estimates",                 icon: <FileCheck size={22} color="#fff" />, gradient: "violet" },
    { href: "/invoices",  label: "Invoices",  hint: "Bill and collect",               icon: <FileText  size={22} color="#fff" />, gradient: "emerald"},
  ];
  const ops: Section[] = [
    { href: "/agent",        label: "Ask",          hint: "AI assistant — ask anything",     icon: <Sparkles      size={22} color="#fff" />, gradient: "dusk"      },
    { href: "/assistant",    label: "Briefing",     hint: "Punch list — what needs you",     icon: <Sparkles      size={22} color="#fff" />, gradient: "primaryLit"},
    { href: "/work-orders",  label: "Jobs",         hint: "Workers, financials, share link", icon: <Briefcase     size={22} color="#fff" />, gradient: "blue"      },
    { href: "/messages",     label: "Messages",     hint: "Customer SMS replies",            icon: <MessageSquare size={22} color="#fff" />, gradient: "ocean"     },
    { href: "/reports",      label: "Site reports", hint: "Inspection & condition reports",  icon: <ClipboardList size={22} color="#fff" />, gradient: "amber"     },
    { href: "/recurring",    label: "Recurring",    hint: "Auto-scheduled work",             icon: <Repeat        size={22} color="#fff" />, gradient: "violet"    },
    { href: "/analytics",    label: "Analytics",    hint: "Revenue, leads, quotes won",      icon: <TrendingUp    size={22} color="#fff" />, gradient: "primary"   },
    { href: "/products",     label: "Products",     hint: "Saved line items catalog",        icon: <Package       size={22} color="#fff" />, gradient: "emerald"   },
    { href: "/agents",       label: "Agents",       hint: "Toggle automations on/off",       icon: <Bot           size={22} color="#fff" />, gradient: "coral"     },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["top", "left", "right"]}>
      <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm }}>
        {active && <BusinessSwitcher active={active} businesses={businesses} role={role} onSwitch={switchTo} />}
      </View>

      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: space.xxl }}>
        <FadeIn>
          <View>
            <Text style={{ fontSize: 28, fontWeight: "800", color: colors.text, letterSpacing: -0.6 }}>Sales</Text>
            <Text style={{ fontSize: 13, color: colors.muted, marginTop: 4 }}>Pick a section to manage.</Text>
          </View>
        </FadeIn>

        <SectionList sections={sales} onPress={(href) => router.push(href as never)} baseDelay={60} />

        <FadeIn delay={300}>
          <Text style={{ fontSize: 11, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: "700", marginTop: space.sm }}>
            Operations
          </Text>
        </FadeIn>
        <SectionList sections={ops} onPress={(href) => router.push(href as never)} baseDelay={340} />
      </ScrollView>
    </SafeAreaView>
  );
}
