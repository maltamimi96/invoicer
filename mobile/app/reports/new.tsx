import { useState } from "react";
import {
  ActivityIndicator, Alert, Image, Pressable, ScrollView, Text, TextInput, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { ArrowLeft, Sparkles, Camera, ImagePlus, Trash2, Save } from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import { uploadJobPhoto } from "@/lib/storage";
import { useActiveBusiness } from "@/lib/active-business";
import { CustomerPicker } from "@/components/CustomerPicker";
import { colors, radius, space } from "@/lib/theme";

interface ReportSection {
  id:    string;
  title: string;
  body:  string;
}

interface PhotoEntry {
  url:     string;
  caption: string;
}

const SECTION_TITLES: Record<string, string> = {
  executive_summary:        "Executive summary",
  tile_condition:           "Tile condition",
  biological_contamination: "Biological contamination",
  ridge_hip_capping:        "Ridge & hip capping",
  valleys_flashings:        "Valleys & flashings",
  solar_panel_mounting:     "Solar panel mounting",
  structural_assessment:    "Structural assessment",
};

/** New site report — uploads photos, calls /api/ai generate_report, saves
 *  the AI-structured sections + meta + photo captions. Mirrors the web
 *  /reports/new flow without the rich editor (mobile = quick capture). */
export default function NewReport() {
  const router = useRouter();
  const { active } = useActiveBusiness();

  const [customer, setCustomer]           = useState<{ id: string; name: string } | null>(null);
  const [propertyAddress, setProperty]    = useState("");
  const [inspectionDate, setInspection]   = useState(new Date().toISOString().split("T")[0]);
  const [roofType, setRoofType]           = useState("Tile");
  const [inspector, setInspector]         = useState("");
  const [notes, setNotes]                 = useState("");
  const [photos, setPhotos]               = useState<PhotoEntry[]>([]);
  const [busy, setBusy]                   = useState(false);
  const [phase, setPhase]                 = useState<"idle" | "uploading" | "generating">("idle");

  const addPhoto = async (source: "camera" | "library") => {
    const perm = source === "camera"
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert("Permission required"); return; }

    const picked = source === "camera"
      ? await ImagePicker.launchCameraAsync({ quality: 0.6, mediaTypes: ImagePicker.MediaTypeOptions.Images })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.6, mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsMultipleSelection: true });
    if (picked.canceled || !picked.assets?.length) return;

    setPhase("uploading");
    setBusy(true);
    try {
      const uploaded: PhotoEntry[] = [];
      for (const asset of picked.assets) {
        const { url } = await uploadJobPhoto(asset.uri);
        uploaded.push({ url, caption: "" });
      }
      setPhotos((prev) => [...prev, ...uploaded]);
    } catch (e) {
      Alert.alert("Couldn't upload", e instanceof Error ? e.message : "Unknown error");
    } finally {
      setBusy(false);
      setPhase("idle");
    }
  };

  const removePhoto = (idx: number) => setPhotos(photos.filter((_, i) => i !== idx));

  const generate = async () => {
    if (!active) return;
    if (!propertyAddress.trim()) { Alert.alert("Property address required"); return; }
    setBusy(true);
    setPhase("generating");
    try {
      const base = process.env.EXPO_PUBLIC_APP_URL ?? "https://kireihq.com";
      const res = await fetch(`${base}/api/ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "generate_report",
          description: notes,
          imageUrls: photos.map((p) => p.url),
          meta: {
            property_address: propertyAddress,
            inspection_date:  inspectionDate,
            roof_type:        roofType,
            inspector_name:   inspector || "Site inspector",
          },
        }),
      });
      if (!res.ok) throw new Error(`AI returned ${res.status}`);
      const { result } = await res.json() as { result: {
        sections: Record<string, string>;
        meta: Record<string, unknown>;
        photo_captions: string[];
      } };

      const sections: ReportSection[] = Object.entries(result.sections ?? {}).map(([k, body]) => ({
        id: k,
        title: SECTION_TITLES[k] ?? k,
        body: body ?? "",
      }));
      const captionedPhotos: PhotoEntry[] = photos.map((p, i) => ({
        url: p.url,
        caption: result.photo_captions?.[i] ?? p.caption,
      }));

      // Save the report
      const { data: { user } } = await supabase.auth.getUser();
      const { data: created, error } = await supabase
        .from("reports")
        .insert({
          user_id:          user?.id,
          business_id:      active.id,
          title:            "Roof Inspection Report",
          status:           "draft",
          customer_id:      customer?.id ?? null,
          property_address: propertyAddress,
          inspection_date:  inspectionDate,
          report_date:      new Date().toISOString().split("T")[0],
          sections,
          photos:           captionedPhotos,
          meta:             { ...result.meta, roof_type: roofType, inspector_name: inspector || "Site inspector" },
        })
        .select("id").single();
      if (error) throw error;
      router.replace(`/reports/${(created as { id: string }).id}` as never);
    } catch (e) {
      Alert.alert("Couldn't generate", e instanceof Error ? e.message : "Unknown error");
    } finally {
      setBusy(false);
      setPhase("idle");
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["top", "left", "right"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.sm, gap: space.sm }}>
        <Pressable onPress={() => router.back()} hitSlop={10}><ArrowLeft size={22} color={colors.text} /></Pressable>
        <Sparkles size={18} color={colors.primary} />
        <Text style={{ fontSize: 18, fontWeight: "700", color: colors.text }}>New report</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md }} keyboardShouldPersistTaps="handled">
        <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 18 }}>
          Snap site photos, jot quick notes, and the AI writes a structured inspection report.
        </Text>

        <View style={{ gap: 6 }}>
          <Text style={lbl}>Customer</Text>
          {active && <CustomerPicker businessId={active.id} value={customer} onChange={setCustomer} />}
        </View>

        <Field label="Property address *" value={propertyAddress} onChangeText={setProperty} placeholder="12 Smith St, Bondi NSW 2026" />
        <View style={{ flexDirection: "row", gap: space.sm }}>
          <View style={{ flex: 1 }}>
            <Field label="Inspection date" value={inspectionDate} onChangeText={setInspection} placeholder="YYYY-MM-DD" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Roof type" value={roofType} onChangeText={setRoofType} placeholder="Tile / Metal / Slate" />
          </View>
        </View>
        <Field label="Inspector name" value={inspector} onChangeText={setInspector} placeholder="Optional" />
        <Field label="Notes / observations" value={notes} onChangeText={setNotes} multiline placeholder="What you saw on site — informal is fine, the AI will tidy it up." />

        {/* Photos */}
        <View style={{ gap: 6 }}>
          <Text style={lbl}>Photos · {photos.length}</Text>
          {photos.length > 0 && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {photos.map((p, idx) => (
                <View key={idx} style={{ width: 88, height: 88, borderRadius: radius.md, overflow: "hidden", backgroundColor: colors.muted + "33" }}>
                  <Image source={{ uri: p.url }} style={{ width: "100%", height: "100%" }} />
                  <Pressable onPress={() => removePhoto(idx)}
                    style={{ position: "absolute", top: 2, right: 2, width: 20, height: 20, borderRadius: 10, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" }}>
                    <Trash2 size={11} color="#fff" />
                  </Pressable>
                </View>
              ))}
            </View>
          )}
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <Pressable onPress={() => addPhoto("camera")} disabled={busy}
              style={({ pressed }) => ({
                flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
                padding: space.sm + 2, borderRadius: radius.md,
                backgroundColor: pressed ? colors.muted : colors.card,
                borderWidth: 1, borderColor: colors.hairline, opacity: busy ? 0.6 : 1,
              })}>
              <Camera size={14} color={colors.text} />
              <Text style={{ fontSize: 12, fontWeight: "700", color: colors.text }}>Camera</Text>
            </Pressable>
            <Pressable onPress={() => addPhoto("library")} disabled={busy}
              style={({ pressed }) => ({
                flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
                padding: space.sm + 2, borderRadius: radius.md,
                backgroundColor: pressed ? colors.muted : colors.card,
                borderWidth: 1, borderColor: colors.hairline, opacity: busy ? 0.6 : 1,
              })}>
              <ImagePlus size={14} color={colors.text} />
              <Text style={{ fontSize: 12, fontWeight: "700", color: colors.text }}>Library</Text>
            </Pressable>
          </View>
        </View>

        <Pressable onPress={generate} disabled={busy}
          style={({ pressed }) => ({
            flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
            padding: space.md, borderRadius: radius.lg,
            backgroundColor: pressed ? "#0d6e6a" : colors.primary,
            opacity: busy ? 0.6 : 1, marginTop: space.sm,
          })}>
          {busy ? <ActivityIndicator color="#fff" />
                : <Sparkles size={18} color="#fff" />}
          <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>
            {phase === "uploading" ? "Uploading photos…"
              : phase === "generating" ? "Writing report…"
              : "Generate report"}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const lbl = {
  fontSize: 11, color: colors.muted,
  textTransform: "uppercase" as const, letterSpacing: 0.6, fontWeight: "700" as const,
};

function Field({ label, value, onChangeText, multiline, placeholder }: {
  label: string; value: string; onChangeText: (v: string) => void;
  multiline?: boolean; placeholder?: string;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={lbl}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        style={{
          padding: space.sm + 2, borderRadius: radius.md,
          backgroundColor: colors.card, borderWidth: 1, borderColor: colors.hairline,
          color: colors.text, fontSize: 14,
          minHeight: multiline ? 100 : undefined,
          textAlignVertical: multiline ? "top" : "auto",
        }}
      />
    </View>
  );
}
