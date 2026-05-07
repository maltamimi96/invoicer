import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, View, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Phone, Mail, MapPin, Clock, MessageSquare } from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import { useActiveBusiness } from "@/lib/active-business";
import { colors, radius, space } from "@/lib/theme";

interface Lead {
  id:            string;
  name:          string;
  status:        "new" | "contacted" | "quoted" | "won" | "lost";
  source:        string | null;
  suburb:        string | null;
  email:         string | null;
  phone:         string | null;
  service:       string | null;
  property_type: string | null;
  timing:        string | null;
  notes:         string | null;
  created_at:    string;
}

const STATUS_COLOUR: Record<Lead["status"], { bg: string; fg: string }> = {
  new:       { bg: "#dbeafe", fg: "#1d4ed8" },
  contacted: { bg: "#fef3c7", fg: "#92400e" },
  quoted:    { bg: "#ede9fe", fg: "#6d28d9" },
  won:       { bg: "#dcfce7", fg: "#166534" },
  lost:      { bg: "#fee2e2", fg: "#991b1b" },
};

const NEXT_STATUS: Lead["status"][] = ["new", "contacted", "quoted", "won", "lost"];

const SOURCE_LABELS: Record<string, string> = {
  "landing-page": "Landing Page", "website": "Website", "referral": "Referral",
  "telegram": "Telegram", "email": "Email", "phone": "Phone", "manual": "Manual",
  "hipages": "HiPages", "service-seeking": "ServiceSeeking", "google": "Google",
  "facebook": "Facebook", "instagram": "Instagram", "word-of-mouth": "Word of mouth",
};

function fmtSource(s: string | null): string {
  if (!s) return "—";
  return SOURCE_LABELS[s] ?? s.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function LeadDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { active } = useActiveBusiness();
  const [lead, setLead] = useState<Lead | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!id || !active) return;
    const { data } = await supabase
      .from("leads")
      .select("*")
      .eq("id", id)
      .eq("business_id", active.id)
      .maybeSingle();
    setLead(data as Lead);
  };

  useEffect(() => { load(); }, [id, active?.id]);

  const setStatus = async (status: Lead["status"]) => {
    if (!lead) return;
    setBusy(true);
    await supabase.from("leads").update({ status }).eq("id", lead.id);
    setLead({ ...lead, status });
    setBusy(false);
  };

  if (!lead) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  const statusColour = STATUS_COLOUR[lead.status];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["top", "left", "right"]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.sm, gap: space.sm }}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <ArrowLeft size={22} color={colors.text} />
        </Pressable>
        <Text style={{ fontSize: 18, fontWeight: "700", color: colors.text }} numberOfLines={1}>{lead.name}</Text>
        <View style={{ flex: 1 }} />
        <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: statusColour.bg }}>
          <Text style={{ fontSize: 10, fontWeight: "700", color: statusColour.fg, textTransform: "uppercase" }}>{lead.status}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md }}>
        {/* Quick actions */}
        <View style={{ flexDirection: "row", gap: space.sm }}>
          {lead.phone && (
            <ActionButton icon={<Phone size={18} color="#fff" />} label="Call" bg={colors.primary} onPress={() => Linking.openURL(`tel:${lead.phone!.replace(/\s/g, "")}`)} />
          )}
          {lead.phone && (
            <ActionButton icon={<MessageSquare size={18} color="#fff" />} label="SMS" bg="#0f766e" onPress={() => Linking.openURL(`sms:${lead.phone!.replace(/\s/g, "")}`)} />
          )}
          {lead.email && (
            <ActionButton icon={<Mail size={18} color="#fff" />} label="Email" bg="#1d4ed8" onPress={() => Linking.openURL(`mailto:${lead.email}`)} />
          )}
        </View>

        {/* Status changer */}
        <View style={{ padding: space.md, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.hairline, gap: space.sm }}>
          <Text style={{ fontSize: 11, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: "700" }}>Status</Text>
          <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
            {NEXT_STATUS.map((s) => {
              const c = STATUS_COLOUR[s];
              const selected = s === lead.status;
              return (
                <Pressable
                  key={s}
                  onPress={() => setStatus(s)}
                  disabled={busy || selected}
                  style={({ pressed }) => ({
                    paddingHorizontal: 12, paddingVertical: 6,
                    borderRadius: 999,
                    backgroundColor: selected ? c.bg : pressed ? colors.muted : "transparent",
                    borderWidth: 1, borderColor: selected ? c.bg : colors.hairline,
                    opacity: busy && !selected ? 0.5 : 1,
                  })}
                >
                  <Text style={{ fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6, color: selected ? c.fg : colors.muted }}>
                    {s}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Details */}
        <View style={{ padding: space.md, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.hairline, gap: 10 }}>
          <Text style={{ fontSize: 11, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: "700" }}>Details</Text>
          <Field label="Source" value={fmtSource(lead.source)} />
          {lead.service && <Field label="Service" value={lead.service} />}
          {lead.suburb && <Field label="Suburb" value={lead.suburb} icon={<MapPin size={12} color={colors.muted} />} />}
          {lead.property_type && <Field label="Property" value={lead.property_type} />}
          {lead.timing && <Field label="Timing" value={lead.timing} />}
          {lead.phone && <Field label="Phone" value={lead.phone} />}
          {lead.email && <Field label="Email" value={lead.email} />}
          <Field label="Created" value={new Date(lead.created_at).toLocaleString()} icon={<Clock size={12} color={colors.muted} />} />
        </View>

        {/* Notes */}
        {lead.notes && (
          <View style={{ padding: space.md, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.hairline, gap: 6 }}>
            <Text style={{ fontSize: 11, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: "700" }}>Notes</Text>
            <Text style={{ fontSize: 14, color: colors.text, lineHeight: 20 }}>{lead.notes}</Text>
          </View>
        )}

        <Text style={{ fontSize: 11, color: colors.muted, textAlign: "center", marginTop: space.md }}>
          Convert to customer / quote / job — coming in next mobile phase
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function ActionButton({ icon, label, bg, onPress }: { icon: React.ReactNode; label: string; bg: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
        padding: space.md, borderRadius: radius.lg,
        backgroundColor: bg, opacity: pressed ? 0.85 : 1,
      })}
    >
      {icon}
      <Text style={{ color: "#fff", fontSize: 14, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}

function Field({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Text style={{ fontSize: 12, color: colors.muted, width: 80 }}>{label}</Text>
      {icon}
      <Text style={{ flex: 1, fontSize: 13, color: colors.text }} numberOfLines={2}>{value}</Text>
    </View>
  );
}
