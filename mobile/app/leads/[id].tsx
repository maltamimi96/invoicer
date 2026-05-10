import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, View, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Phone, Mail, MapPin, Clock, MessageSquare, UserCheck, FileCheck } from "lucide-react-native";
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

  /** Convert this lead into a customer, then open the customer detail page.
   *  Marks the lead as 'won'. Mirrors the web convertLeadToCustomer action
   *  (lib/actions/leads.ts) inline against supabase + RLS. */
  const convertToCustomer = async () => {
    if (!lead || !active) return;
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: created, error } = await supabase
        .from("customers")
        .insert({
          business_id: active.id, user_id: user?.id,
          name: lead.name,
          phone: lead.phone,
          email: lead.email,
          city: lead.suburb,
          country: "Australia",
          notes: lead.notes,
          archived: false,
        })
        .select("id").single();
      if (error) throw error;
      await supabase.from("leads").update({ status: "won", converted_at: new Date().toISOString() }).eq("id", lead.id);
      Alert.alert("Customer created", `${lead.name} added to your customer list.`);
      router.replace(`/customers/${(created as { id: string }).id}` as never);
    } catch (e) {
      Alert.alert("Couldn't convert", e instanceof Error ? e.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  };

  /** Convert this lead into a draft quote. Reuses an existing customer
   *  matched by email or phone, otherwise mints a fresh one. Marks the
   *  lead 'quoted' and routes to the new quote so the user can fill
   *  line items. Mirrors web convertLeadToQuote. */
  const convertToQuote = async () => {
    if (!lead || !active) return;
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Find or create a customer for this lead
      let customerId: string | null = null;
      if (lead.email || lead.phone) {
        const filters = [lead.email && `email.eq.${lead.email}`, lead.phone && `phone.eq.${lead.phone}`].filter(Boolean).join(",");
        const { data: existing } = await supabase
          .from("customers").select("id")
          .eq("business_id", active.id).eq("archived", false)
          .or(filters).limit(1).maybeSingle();
        customerId = (existing as { id: string } | null)?.id ?? null;
      }
      if (!customerId) {
        const { data: created, error: cErr } = await supabase
          .from("customers")
          .insert({
            business_id: active.id, user_id: user?.id,
            name: lead.name, phone: lead.phone, email: lead.email,
            city: lead.suburb, country: "Australia", notes: lead.notes,
            archived: false,
          })
          .select("id").single();
        if (cErr) throw cErr;
        customerId = (created as { id: string }).id;
      }

      // Mint a fresh quote number
      const { data: biz } = await supabase
        .from("businesses").select("quote_prefix, quote_next_number")
        .eq("id", active.id).single();
      const prefix = (biz as { quote_prefix?: string; quote_next_number?: number })?.quote_prefix ?? "QT";
      const nextNum = (biz as { quote_prefix?: string; quote_next_number?: number })?.quote_next_number ?? 1;
      const number = `${prefix}-${String(nextNum).padStart(4, "0")}`;
      await supabase.from("businesses").update({ quote_next_number: nextNum + 1 }).eq("id", active.id);

      const today = new Date().toISOString().split("T")[0];
      const expiry = new Date(Date.now() + 30 * 86_400_000).toISOString().split("T")[0];
      const { data: quote, error: qErr } = await supabase
        .from("quotes")
        .insert({
          user_id: user?.id, business_id: active.id, number,
          status: "draft",
          customer_id: customerId,
          issue_date: today, expiry_date: expiry,
          line_items: [],
          subtotal: 0, tax_total: 0, total: 0,
          notes: lead.notes ?? null, terms: null,
        })
        .select("id").single();
      if (qErr) throw qErr;

      await supabase.from("leads").update({ status: "quoted" }).eq("id", lead.id);
      Alert.alert("Quote drafted", `${number} created — add line items next.`);
      router.replace(`/quotes/${(quote as { id: string }).id}` as never);
    } catch (e) {
      Alert.alert("Couldn't create quote", e instanceof Error ? e.message : "Unknown error");
    } finally {
      setBusy(false);
    }
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

        <Pressable
          onPress={convertToCustomer}
          disabled={busy || lead.status === "won"}
          style={({ pressed }) => ({
            flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
            padding: space.md, borderRadius: radius.lg,
            backgroundColor: lead.status === "won" ? colors.muted : pressed ? "#0d6e6a" : colors.primary,
            opacity: busy ? 0.6 : 1,
            marginTop: space.sm,
          })}
        >
          <UserCheck size={18} color="#fff" />
          <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>
            {lead.status === "won" ? "Already converted" : "Convert to customer"}
          </Text>
        </Pressable>

        <Pressable
          onPress={convertToQuote}
          disabled={busy || lead.status === "quoted" || lead.status === "won"}
          style={({ pressed }) => ({
            flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
            padding: space.md, borderRadius: radius.lg,
            backgroundColor: lead.status === "quoted" || lead.status === "won"
              ? colors.muted
              : pressed ? "#5b21b6" : "#7c3aed",
            opacity: busy ? 0.6 : 1,
          })}
        >
          <FileCheck size={18} color="#fff" />
          <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>
            {lead.status === "quoted" ? "Already quoted" : "Convert to quote"}
          </Text>
        </Pressable>
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
