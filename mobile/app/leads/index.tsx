import { useEffect, useState, useMemo } from "react";
import { FlatList, Pressable, Text, View, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { ArrowLeft, MapPin, Phone, Mail, Clock, Plus, UserPlus } from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import { useActiveBusiness } from "@/lib/active-business";
import { colors, radius, space } from "@/lib/theme";
import { Avatar } from "@/components/Avatar";
import { StatusPill } from "@/components/StatusPill";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonRow } from "@/components/Skeleton";
import { BrandedRefresh } from "@/components/BrandedRefresh";
import { FadeIn } from "@/components/FadeIn";

interface LeadRow {
  id:         string;
  name:       string;
  status:     "new" | "contacted" | "quoted" | "won" | "lost";
  source:     string | null;
  suburb:     string | null;
  email:      string | null;
  phone:      string | null;
  service:    string | null;
  created_at: string;
}

const STATUS_COLOUR: Record<LeadRow["status"], { bg: string; fg: string }> = {
  new:       { bg: "#dbeafe", fg: "#1d4ed8" },
  contacted: { bg: "#fef3c7", fg: "#92400e" },
  quoted:    { bg: "#ede9fe", fg: "#6d28d9" },
  won:       { bg: "#dcfce7", fg: "#166534" },
  lost:      { bg: "#fee2e2", fg: "#991b1b" },
};

const SOURCE_LABELS: Record<string, string> = {
  "landing-page":   "Landing Page",
  "website":        "Website",
  "referral":       "Referral",
  "telegram":       "Telegram",
  "email":          "Email",
  "phone":          "Phone",
  "manual":         "Manual",
  "hipages":        "HiPages",
  "service-seeking":"ServiceSeeking",
  "google":         "Google",
  "facebook":       "Facebook",
  "instagram":      "Instagram",
  "word-of-mouth":  "Word of mouth",
};

function fmtSource(s: string | null): string {
  if (!s) return "—";
  return SOURCE_LABELS[s] ?? s.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const TABS: Array<{ id: "all" | LeadRow["status"]; label: string }> = [
  { id: "all", label: "All" },
  { id: "new", label: "New" },
  { id: "contacted", label: "Contacted" },
  { id: "quoted", label: "Quoted" },
  { id: "won", label: "Won" },
];

export default function LeadsList() {
  const router = useRouter();
  const { active } = useActiveBusiness();
  const [leads, setLeads]         = useState<LeadRow[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<typeof TABS[number]["id"]>("all");

  const load = async () => {
    if (!active) return;
    const { data } = await supabase
      .from("leads")
      .select("id, name, status, source, suburb, email, phone, service, created_at")
      .eq("business_id", active.id)
      .order("created_at", { ascending: false }).limit(100);
    setLeads((data ?? []) as LeadRow[]);
  };

  useEffect(() => { load(); }, [active?.id]);

  const filtered = useMemo(() => {
    if (!leads) return null;
    if (tab === "all") return leads;
    return leads.filter((l) => l.status === tab);
  }, [leads, tab]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["top", "left", "right"]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.sm, gap: space.sm }}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <ArrowLeft size={22} color={colors.text} />
        </Pressable>
        <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text }}>Leads</Text>
        <View style={{ flex: 1 }} />
        <Text style={{ fontSize: 12, color: colors.muted }}>{leads?.length ?? 0}</Text>
        <Pressable
          onPress={() => router.push("/leads/new" as never)}
          hitSlop={8}
          style={({ pressed }) => ({
            marginLeft: 8, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
            backgroundColor: pressed ? "#0d6e6a" : colors.primary,
            flexDirection: "row", alignItems: "center", gap: 4,
          })}
        >
          <Plus size={14} color="#fff" />
          <Text style={{ fontSize: 12, fontWeight: "700", color: "#fff" }}>Add</Text>
        </Pressable>
      </View>

      {/* Filter pills */}
      <View style={{ flexDirection: "row", gap: 6, paddingHorizontal: space.lg, paddingBottom: space.sm, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <Pressable
            key={t.id}
            onPress={() => setTab(t.id)}
            style={({ pressed }) => ({
              paddingHorizontal: 12, paddingVertical: 6,
              borderRadius: 999,
              backgroundColor: tab === t.id ? colors.primary : pressed ? colors.muted : colors.card,
              borderWidth: 1, borderColor: tab === t.id ? colors.primary : colors.hairline,
            })}
          >
            <Text style={{ fontSize: 12, fontWeight: "600", color: tab === t.id ? "#fff" : colors.text }}>
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {leads === null ? (
        <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm, gap: 4 }}>
          {Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} avatar />)}
        </View>
      ) : filtered!.length === 0 ? (
        <EmptyState
          icon={<UserPlus size={32} color="#fff" />}
          title="No leads in this view"
          subtitle="When new opportunities come in (manual, landing page, or integrations), they'll show up here."
          ctaLabel="Add lead"
          onPressCta={() => router.push("/leads/new" as never)}
          gradient="blue"
        />
      ) : (
        <FlatList
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={7}
          removeClippedSubviews
          data={filtered!}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xxl }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          refreshControl={<BrandedRefresh refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
          renderItem={({ item, index }) => (
            <FadeIn delay={Math.min(index * 30, 240)}>
              <LeadCard lead={item} onPress={() => router.push(`/leads/${item.id}` as never)} />
            </FadeIn>
          )}
        />
      )}
    </SafeAreaView>
  );
}

function LeadCard({ lead, onPress }: { lead: LeadRow; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        padding: space.md, borderRadius: radius.lg,
        backgroundColor: pressed ? colors.muted : colors.card,
        borderWidth: 1, borderColor: colors.hairline,
        gap: 6,
      })}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        <Avatar name={lead.name} size={36} />
        <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, fontWeight: "700", color: colors.text }}>{lead.name}</Text>
        <StatusPill tone={lead.status} />
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <Text style={{ fontSize: 11, color: colors.muted }}>{fmtSource(lead.source)}</Text>
        {lead.suburb && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
            <MapPin size={10} color={colors.muted} />
            <Text style={{ fontSize: 11, color: colors.muted }}>{lead.suburb}</Text>
          </View>
        )}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
          <Clock size={10} color={colors.muted} />
          <Text style={{ fontSize: 11, color: colors.muted }}>{fmtAge(lead.created_at)}</Text>
        </View>
      </View>
      {lead.service && (
        <Text numberOfLines={1} style={{ fontSize: 12, color: colors.text, marginTop: 2 }}>{lead.service}</Text>
      )}
      {/* Quick actions */}
      {(lead.phone || lead.email) && (
        <View style={{ flexDirection: "row", gap: 6, marginTop: 4 }}>
          {lead.phone && (
            <Pressable
              onPress={(e) => { e.stopPropagation(); Linking.openURL(`tel:${lead.phone!.replace(/\s/g, "")}`); }}
              hitSlop={6}
              style={({ pressed }) => ({
                flexDirection: "row", alignItems: "center", gap: 4,
                paddingHorizontal: 10, paddingVertical: 6,
                borderRadius: radius.md, backgroundColor: pressed ? colors.muted : colors.primarySoft,
              })}
            >
              <Phone size={12} color={colors.primary} />
              <Text style={{ fontSize: 11, color: colors.primary, fontWeight: "600" }}>Call</Text>
            </Pressable>
          )}
          {lead.email && (
            <Pressable
              onPress={(e) => { e.stopPropagation(); Linking.openURL(`mailto:${lead.email}`); }}
              hitSlop={6}
              style={({ pressed }) => ({
                flexDirection: "row", alignItems: "center", gap: 4,
                paddingHorizontal: 10, paddingVertical: 6,
                borderRadius: radius.md, backgroundColor: pressed ? colors.muted : "#dbeafe",
              })}
            >
              <Mail size={12} color="#1d4ed8" />
              <Text style={{ fontSize: 11, color: "#1d4ed8", fontWeight: "600" }}>Email</Text>
            </Pressable>
          )}
        </View>
      )}
    </Pressable>
  );
}
