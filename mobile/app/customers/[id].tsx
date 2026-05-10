import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, Share, Text, View, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Phone, Mail, MapPin, Building2, FileText, FileCheck, Wrench, Send, Home } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { supabase } from "@/lib/supabase";
import { useActiveBusiness } from "@/lib/active-business";
import { colors, gradients, radius, space } from "@/lib/theme";
import { FadeIn } from "@/components/FadeIn";
import { PatternBackground } from "@/components/PatternBackground";

interface Customer {
  id:       string;
  name:     string;
  company:  string | null;
  email:    string | null;
  phone:    string | null;
  address:  string | null;
  city:     string | null;
  state:    string | null;
  postcode: string | null;
  country:  string | null;
  notes:    string | null;
}

interface RelatedCounts {
  invoices: number;
  quotes:   number;
  jobs:     number;
}

interface Site {
  id:       string;
  label:    string | null;
  address:  string | null;
  city:     string | null;
  postcode: string | null;
}

const num = (v: unknown) => { const n = typeof v === "number" ? v : parseFloat(String(v ?? 0)); return Number.isFinite(n) ? n : 0; };

function fmtCurrency(n: number, currency: string): string {
  try { return new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(n); }
  catch { return `${currency} ${n.toFixed(2)}`; }
}

export default function CustomerDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { active } = useActiveBusiness();

  const [customer,    setCustomer]    = useState<Customer | null>(null);
  const [counts,      setCounts]      = useState<RelatedCounts>({ invoices: 0, quotes: 0, jobs: 0 });
  const [outstanding, setOutstanding] = useState(0);
  const [sites,       setSites]       = useState<Site[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);

  const currency = active?.currency ?? "AUD";

  const load = async () => {
    if (!id || !active) return;
    const [{ data: c }, { data: invs }, { data: qts }, { data: wos }, { data: ss }] = await Promise.all([
      supabase.from("customers").select("*").eq("id", id).eq("business_id", active.id).maybeSingle(),
      supabase.from("invoices").select("status, total, amount_paid").eq("customer_id", id).eq("business_id", active.id),
      supabase.from("quotes").select("id").eq("customer_id", id).eq("business_id", active.id),
      supabase.from("work_orders").select("id").eq("customer_id", id).eq("business_id", active.id),
      supabase.from("sites").select("id, label, address, city, postcode").eq("account_id", id).eq("business_id", active.id).eq("archived", false).order("created_at", { ascending: true }),
    ]);
    setCustomer(c as Customer);
    setSites((ss ?? []) as Site[]);
    setCounts({
      invoices: (invs ?? []).length,
      quotes:   (qts ?? []).length,
      jobs:     (wos ?? []).length,
    });
    const outstandingTotal = (invs ?? [])
      .filter((i: { status: string }) => ["sent", "partial", "overdue"].includes(i.status))
      .reduce((s: number, i: { total: unknown; amount_paid: unknown }) => s + Math.max(0, num(i.total) - num(i.amount_paid)), 0);
    setOutstanding(outstandingTotal);
    setLoading(false);
  };

  useEffect(() => { load(); }, [id, active?.id]);

  const [busy, setBusy] = useState(false);

  /** Mint or reuse a 90-day portal token and share the customer hub URL. */
  const shareHubLink = async () => {
    if (!customer || !active) return;
    setBusy(true);
    try {
      const { data: existing } = await supabase
        .from("customer_portal_tokens")
        .select("token")
        .eq("business_id", active.id)
        .eq("customer_id", customer.id)
        .is("revoked_at", null)
        .or("expires_at.is.null,expires_at.gt." + new Date().toISOString())
        .limit(1)
        .maybeSingle();
      let token = (existing as { token?: string } | null)?.token;
      if (!token) {
        token = "cust_" + cryptoHex(48);
        const { data: { user } } = await supabase.auth.getUser();
        await supabase.from("customer_portal_tokens").insert({
          token, business_id: active.id, customer_id: customer.id,
          created_by: user?.id, expires_at: new Date(Date.now() + 90 * 86_400_000).toISOString(),
        });
      }
      const base = process.env.EXPO_PUBLIC_APP_URL ?? "https://kireihq.com";
      const url = `${base}/portal/${token}`;
      await Share.share({
        message: `Hi${customer.name ? " " + customer.name.split(" ")[0] : ""}, here's your customer hub: ${url}`,
        url, title: `${customer.name} — Customer hub`,
      });
    } catch (e) {
      Alert.alert("Couldn't share", e instanceof Error ? e.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  };

  if (loading || !customer) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  const addressLines = [
    customer.address,
    [customer.city, customer.state, customer.postcode].filter(Boolean).join(" "),
    customer.country,
  ].filter(Boolean);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["top", "left", "right"]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.sm, gap: space.sm }}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <ArrowLeft size={22} color={colors.text} />
        </Pressable>
        <Text style={{ fontSize: 14, color: colors.muted }}>Customer</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: space.xxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.primary} />}
      >
        {/* Identity card — gradient hero */}
        <FadeIn>
          <View style={{ borderRadius: radius.xl, overflow: "hidden" }}>
            <LinearGradient
              colors={gradients.primary as unknown as readonly [string, string, ...string[]]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={{ padding: space.lg + 4, gap: 8, minHeight: 110 }}
            >
              <PatternBackground variant="dots" color="#fff" opacity={0.13} />
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
                <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontSize: 22, fontWeight: "800", color: "#fff" }}>
                    {customer.name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?"}
                  </Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 22, fontWeight: "800", color: "#fff", letterSpacing: -0.4 }} numberOfLines={1}>{customer.name}</Text>
                  {customer.company && (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
                      <Building2 size={13} color="rgba(255,255,255,0.85)" />
                      <Text style={{ fontSize: 13, color: "rgba(255,255,255,0.9)" }}>{customer.company}</Text>
                    </View>
                  )}
                </View>
              </View>
            </LinearGradient>
          </View>
        </FadeIn>

        {/* Quick contact actions */}
        <View style={{ flexDirection: "row", gap: space.sm }}>
          {customer.phone && (
            <ContactAction
              icon={<Phone size={18} color="#fff" />}
              label="Call"
              bg={colors.primary}
              onPress={() => Linking.openURL(`tel:${customer.phone!.replace(/\s/g, "")}`)}
            />
          )}
          {customer.email && (
            <ContactAction
              icon={<Mail size={18} color="#fff" />}
              label="Email"
              bg="#1d4ed8"
              onPress={() => Linking.openURL(`mailto:${customer.email}`)}
            />
          )}
          {customer.phone && (
            <ContactAction
              icon={<MapPin size={18} color="#fff" />}
              label="SMS"
              bg="#0f766e"
              onPress={() => Linking.openURL(`sms:${customer.phone!.replace(/\s/g, "")}`)}
            />
          )}
        </View>

        {/* Hub share */}
        <Pressable
          onPress={shareHubLink}
          disabled={busy}
          style={({ pressed }) => ({
            flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
            padding: space.md, borderRadius: radius.lg,
            backgroundColor: pressed ? "#0d6e6a" : colors.primary,
            opacity: busy ? 0.6 : 1,
          })}
        >
          <Send size={18} color="#fff" />
          <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>
            Share customer hub link
          </Text>
        </Pressable>

        {/* Outstanding strip */}
        {outstanding > 0 && (
          <View style={{ padding: space.md, borderRadius: radius.lg, backgroundColor: "#fef2f2", borderWidth: 1, borderColor: "#fecaca" }}>
            <Text style={{ fontSize: 12, color: "#991b1b", fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.6 }}>
              Outstanding balance
            </Text>
            <Text style={{ fontSize: 22, fontWeight: "700", color: "#7f1d1d", letterSpacing: -0.4, marginTop: 2 }}>
              {fmtCurrency(outstanding, currency)}
            </Text>
          </View>
        )}

        {/* Counts */}
        <View style={{ flexDirection: "row", gap: space.sm }}>
          <CountTile icon={<FileText  size={16} color={colors.muted} />} label="Invoices" value={counts.invoices} />
          <CountTile icon={<FileCheck size={16} color={colors.muted} />} label="Quotes"   value={counts.quotes} />
          <CountTile icon={<Wrench    size={16} color={colors.muted} />} label="Jobs"     value={counts.jobs} />
        </View>

        {/* Contact details */}
        {(customer.phone || customer.email || addressLines.length > 0) && (
          <View style={{ padding: space.md, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.hairline, gap: 10 }}>
            <Text style={{ fontSize: 11, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: "700" }}>Contact</Text>
            {customer.phone && (
              <Pressable onPress={() => Linking.openURL(`tel:${customer.phone!.replace(/\s/g, "")}`)} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Phone size={14} color={colors.primary} />
                <Text style={{ fontSize: 14, color: colors.primary }}>{customer.phone}</Text>
              </Pressable>
            )}
            {customer.email && (
              <Pressable onPress={() => Linking.openURL(`mailto:${customer.email}`)} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Mail size={14} color={colors.primary} />
                <Text style={{ fontSize: 14, color: colors.primary }}>{customer.email}</Text>
              </Pressable>
            )}
            {addressLines.length > 0 && (
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                <MapPin size={14} color={colors.muted} style={{ marginTop: 2 }} />
                <View style={{ flex: 1 }}>
                  {addressLines.map((line, i) => (
                    <Text key={i} style={{ fontSize: 14, color: colors.text }}>{line}</Text>
                  ))}
                </View>
              </View>
            )}
          </View>
        )}

        {/* Properties / Sites */}
        {sites.length > 0 && (
          <View style={{ borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.hairline, overflow: "hidden" }}>
            <View style={{ paddingHorizontal: space.md, paddingTop: space.md, paddingBottom: 8, flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Home size={14} color={colors.muted} />
              <Text style={{ flex: 1, fontSize: 11, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: "700" }}>
                Properties · {sites.length}
              </Text>
            </View>
            {sites.map((s) => {
              const addr = [s.address, s.city, s.postcode].filter(Boolean).join(", ");
              return (
                <View key={s.id} style={{ paddingHorizontal: space.md, paddingVertical: space.sm + 2, borderTopWidth: 1, borderTopColor: colors.hairline }}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: colors.text }}>{s.label || addr || "Site"}</Text>
                  {addr && s.label && (
                    <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>{addr}</Text>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* Notes */}
        {customer.notes && (
          <View style={{ padding: space.md, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.hairline, gap: 6 }}>
            <Text style={{ fontSize: 11, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: "700" }}>Notes</Text>
            <Text style={{ fontSize: 14, color: colors.text, lineHeight: 20 }}>{customer.notes}</Text>
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

/** RN doesn't have a stable randomBytes; use Math.random for the token. The
 *  value isn't a security boundary on the client (RLS validates), it's just
 *  an unguessable opaque id like the web mints. */
function cryptoHex(byteLen: number): string {
  let out = "";
  for (let i = 0; i < byteLen * 2; i++) out += "0123456789abcdef"[Math.floor(Math.random() * 16)];
  return out;
}

function ContactAction({ icon, label, bg, onPress }: { icon: React.ReactNode; label: string; bg: string; onPress: () => void }) {
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

function CountTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <View style={{
      flex: 1, padding: space.md, borderRadius: radius.lg,
      backgroundColor: colors.card, borderWidth: 1, borderColor: colors.hairline,
      alignItems: "center", gap: 4,
    }}>
      {icon}
      <Text style={{ fontSize: 22, fontWeight: "700", color: colors.text, letterSpacing: -0.4 }}>{value}</Text>
      <Text style={{ fontSize: 10, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: "600" }}>{label}</Text>
    </View>
  );
}
