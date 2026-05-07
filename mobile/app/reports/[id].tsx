import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, View, Image, Share } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Download, Send, MapPin } from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import { useActiveBusiness } from "@/lib/active-business";
import { colors, radius, space } from "@/lib/theme";

interface ReportSection { id: string; title: string; content: string }
interface ReportPhoto   { id: string; url: string; caption?: string; order?: number }
interface ReportMeta {
  inspector_name?: string; inspector_license?: string;
  roof_type?: string; roof_features?: string; inspection_method?: string;
  risk_items?: Array<{ defect: string; likelihood: string; consequence: string; rating: string }>;
  scope_of_works?: string[]; urgency?: string; advisory_banner?: string;
}
interface FullReport {
  id: string;
  title: string;
  status: "draft" | "complete";
  property_address: string | null;
  inspection_date: string | null;
  report_date:     string | null;
  sections: ReportSection[];
  photos:   ReportPhoto[];
  meta:     ReportMeta;
  customers: { id: string; name: string } | null;
  customer_id: string | null;
}

function cryptoHex(byteLen: number): string {
  let out = ""; for (let i = 0; i < byteLen * 2; i++) out += "0123456789abcdef"[Math.floor(Math.random() * 16)]; return out;
}

export default function ReportDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { active } = useActiveBusiness();
  const [report, setReport] = useState<FullReport | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!id || !active) return;
    const { data } = await supabase
      .from("reports")
      .select("*, customers(id, name)")
      .eq("id", id)
      .eq("business_id", active.id)
      .maybeSingle();
    setReport(data as unknown as FullReport);
  };

  useEffect(() => { load(); }, [id, active?.id]);

  const toggleStatus = async () => {
    if (!report) return;
    const next = report.status === "complete" ? "draft" : "complete";
    setBusy(true);
    await supabase.from("reports").update({ status: next }).eq("id", report.id);
    setReport({ ...report, status: next });
    setBusy(false);
  };

  const shareLink = async () => {
    if (!report || !active || !report.customer_id) return;
    setBusy(true);
    try {
      const { data: existing } = await supabase
        .from("customer_portal_tokens")
        .select("token")
        .eq("business_id", active.id)
        .eq("customer_id", report.customer_id)
        .is("revoked_at", null)
        .or("expires_at.is.null,expires_at.gt." + new Date().toISOString())
        .limit(1).maybeSingle();
      let token = (existing as { token?: string } | null)?.token;
      if (!token) {
        token = "cust_" + cryptoHex(48);
        const { data: { user } } = await supabase.auth.getUser();
        await supabase.from("customer_portal_tokens").insert({
          token, business_id: active.id, customer_id: report.customer_id,
          created_by: user?.id, expires_at: new Date(Date.now() + 90 * 86_400_000).toISOString(),
        });
      }
      const base = process.env.EXPO_PUBLIC_APP_URL ?? "https://kireihq.com";
      const url = `${base}/portal/${token}/report/${report.id}`;
      await Share.share({
        message: `Hi${report.customers?.name ? " " + report.customers.name.split(" ")[0] : ""}, your inspection report is ready: ${url}`,
        url, title: report.title,
      });
    } finally { setBusy(false); }
  };

  const downloadPdf = () => {
    if (!report || !active) return;
    const base = process.env.EXPO_PUBLIC_APP_URL ?? "https://kireihq.com";
    Linking.openURL(`${base}/api/pdf/report/${report.id}`);
  };

  if (!report) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  const inspector = (report.meta?.inspector_name ?? "") + (report.meta?.inspector_license ? `  (Lic. ${report.meta.inspector_license})` : "");

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["top", "left", "right"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.sm, gap: space.sm }}>
        <Pressable onPress={() => router.back()} hitSlop={10}><ArrowLeft size={22} color={colors.text} /></Pressable>
        <Text style={{ flex: 1, fontSize: 16, fontWeight: "700", color: colors.text }} numberOfLines={1}>{report.title}</Text>
        <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: report.status === "complete" ? "#dcfce7" : "#fef3c7" }}>
          <Text style={{ fontSize: 10, fontWeight: "700", color: report.status === "complete" ? "#166534" : "#92400e", textTransform: "uppercase" }}>
            {report.status === "complete" ? "Final" : "Draft"}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md }}>
        {/* Property strip */}
        {report.property_address && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.hairline }}>
            <MapPin size={16} color={colors.muted} />
            <Text style={{ flex: 1, fontSize: 14, color: colors.text }}>{report.property_address}</Text>
          </View>
        )}

        {/* Quick actions */}
        <View style={{ flexDirection: "row", gap: space.sm }}>
          <Pressable onPress={downloadPdf} style={({ pressed }) => ({
            flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
            padding: space.md, borderRadius: radius.lg, backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1,
          })}>
            <Download size={16} color="#fff" />
            <Text style={{ color: "#fff", fontSize: 14, fontWeight: "600" }}>Open PDF</Text>
          </Pressable>
          {report.customer_id && (
            <Pressable onPress={shareLink} disabled={busy} style={({ pressed }) => ({
              flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
              padding: space.md, borderRadius: radius.lg, backgroundColor: pressed ? "#0d6e6a" : "#0f766e", opacity: busy ? 0.6 : 1,
            })}>
              <Send size={16} color="#fff" />
              <Text style={{ color: "#fff", fontSize: 14, fontWeight: "600" }}>Share link</Text>
            </Pressable>
          )}
        </View>

        {/* Toggle status */}
        <Pressable onPress={toggleStatus} disabled={busy}
          style={({ pressed }) => ({
            padding: space.md, borderRadius: radius.lg,
            backgroundColor: pressed ? colors.muted : colors.card,
            borderWidth: 1, borderColor: colors.hairline, alignItems: "center",
          })}>
          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.text }}>
            {report.status === "complete" ? "Reset to draft" : "Mark complete"}
          </Text>
        </Pressable>

        {/* Property + inspection */}
        <View style={{ padding: space.md, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.hairline, gap: 8 }}>
          <Text style={{ fontSize: 11, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: "700" }}>Property &amp; inspection</Text>
          <KV label="Roof type"        value={report.meta?.roof_type ?? "—"} />
          <KV label="Roof features"    value={report.meta?.roof_features ?? "—"} />
          <KV label="Inspection method" value={report.meta?.inspection_method ?? "—"} />
          <KV label="Inspector"         value={inspector || "—"} />
          <KV label="Inspection date"   value={report.inspection_date ?? "—"} />
        </View>

        {/* Sections */}
        {report.sections?.filter((s) => s.content?.trim()).map((s) => (
          <View key={s.id} style={{ padding: space.md, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.hairline, gap: 6 }}>
            <Text style={{ fontSize: 11, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: "700" }}>{s.title}</Text>
            <Text style={{ fontSize: 14, color: colors.text, lineHeight: 20 }}>{s.content}</Text>
          </View>
        ))}

        {/* Photos */}
        {report.photos && report.photos.length > 0 && (
          <View style={{ padding: space.md, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.hairline, gap: space.sm }}>
            <Text style={{ fontSize: 11, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: "700" }}>
              Photos ({report.photos.length})
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {report.photos.map((p) => (
                <View key={p.id} style={{ width: "48%" }}>
                  <Image source={{ uri: p.url }} style={{ width: "100%", aspectRatio: 1.4, borderRadius: radius.md, backgroundColor: colors.muted }} />
                  {p.caption ? <Text style={{ fontSize: 11, color: colors.muted, marginTop: 4 }} numberOfLines={2}>{p.caption}</Text> : null}
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
      <Text style={{ width: 110, fontSize: 12, color: colors.muted }}>{label}</Text>
      <Text style={{ flex: 1, fontSize: 13, color: colors.text }}>{value}</Text>
    </View>
  );
}
