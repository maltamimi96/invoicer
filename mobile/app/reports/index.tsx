import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Linking, Pressable, RefreshControl, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { ArrowLeft, FileText, Download, MapPin } from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import { useActiveBusiness } from "@/lib/active-business";
import { colors, radius, space } from "@/lib/theme";

interface ReportRow {
  id: string;
  title: string;
  status: "draft" | "complete";
  property_address: string | null;
  inspection_date: string | null;
  report_date: string | null;
  customers: { name: string } | null;
}

export default function ReportsList() {
  const router = useRouter();
  const { active } = useActiveBusiness();
  const [reports, setReports] = useState<ReportRow[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    if (!active) return;
    const { data } = await supabase
      .from("reports")
      .select("id, title, status, property_address, inspection_date, report_date, customers(name)")
      .eq("business_id", active.id)
      .order("report_date", { ascending: false });
    setReports((data ?? []) as unknown as ReportRow[]);
  };

  useEffect(() => { load(); }, [active?.id]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["top", "left", "right"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.sm, gap: space.sm }}>
        <Pressable onPress={() => router.back()} hitSlop={10}><ArrowLeft size={22} color={colors.text} /></Pressable>
        <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text }}>Site reports</Text>
        <View style={{ flex: 1 }} />
        <Text style={{ fontSize: 12, color: colors.muted }}>{reports?.length ?? 0}</Text>
      </View>
      {reports === null ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={colors.primary} /></View>
      ) : reports.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: space.xl, gap: 8 }}>
          <FileText size={28} color={colors.muted} />
          <Text style={{ fontSize: 14, color: colors.muted }}>No reports yet</Text>
        </View>
      ) : (
        <FlatList
          data={reports}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xxl }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.primary} />}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/reports/${item.id}` as never)}
              style={({ pressed }) => ({
                padding: space.md, borderRadius: radius.lg,
                backgroundColor: pressed ? colors.muted : colors.card,
                borderWidth: 1, borderColor: colors.hairline, gap: 6,
              })}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <FileText size={14} color={colors.muted} />
                <Text style={{ flex: 1, fontSize: 14, fontWeight: "600", color: colors.text }} numberOfLines={1}>{item.title}</Text>
                <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: item.status === "complete" ? "#dcfce7" : "#fef3c7" }}>
                  <Text style={{ fontSize: 10, fontWeight: "700", color: item.status === "complete" ? "#166534" : "#92400e", textTransform: "uppercase" }}>
                    {item.status === "complete" ? "Final" : "Draft"}
                  </Text>
                </View>
              </View>
              {item.customers?.name && <Text style={{ fontSize: 12, color: colors.text }}>{item.customers.name}</Text>}
              {item.property_address && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <MapPin size={11} color={colors.muted} />
                  <Text style={{ fontSize: 11, color: colors.muted }} numberOfLines={1}>{item.property_address}</Text>
                </View>
              )}
              <Text style={{ fontSize: 11, color: colors.muted }}>
                {item.report_date ?? "—"}{item.inspection_date ? ` · inspected ${item.inspection_date}` : ""}
              </Text>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}
