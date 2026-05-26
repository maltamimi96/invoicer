import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, Pressable, ScrollView, Share, Switch, Text, TextInput, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { ArrowLeft, CalendarClock, Plus, Trash2, Share2, ExternalLink } from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import { useActiveBusiness } from "@/lib/active-business";
import { colors, radius, space } from "@/lib/theme";

const APP_URL = process.env.EXPO_PUBLIC_APP_URL || "https://kireihq.com";
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

interface Settings {
  business_id: string; enabled: boolean; slug: string | null; timezone: string;
  min_lead_minutes: number; max_advance_days: number; slot_granularity_minutes: number;
  default_buffer_minutes: number; max_per_day: number | null;
  require_phone: boolean; require_email: boolean; require_address: boolean;
  confirmation_message: string | null; cancellation_window_hours: number;
  create_lead: boolean; create_work_order: boolean;
  notify_customer_email: boolean; notify_customer_sms: boolean; notify_team_email: boolean;
}
interface ApptType { id: string; name: string; duration_minutes: number; price_display: string | null; active: boolean }
interface Resource { id: string; display_name: string; active: boolean }
interface Appt { id: string; customer_name: string; customer_phone: string | null; starts_at: string; status: string }

export default function BookingSettings() {
  const router = useRouter();
  const { active, role } = useActiveBusiness();
  const canEdit = role === "owner" || role === "admin" || role === "editor";

  const [settings, setSettings] = useState<Settings | null>(null);
  const [types, setTypes] = useState<ApptType[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [appts, setAppts] = useState<Appt[]>([]);
  const [slugInput, setSlugInput] = useState("");
  const [newType, setNewType] = useState({ name: "", minutes: "60" });
  const [newResource, setNewResource] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!active) return;
    let { data: s } = await supabase.from("booking_settings").select("*").eq("business_id", active.id).maybeSingle();
    if (!s) {
      const ins = await supabase.from("booking_settings").insert({ business_id: active.id }).select("*").single();
      s = ins.data;
    }
    setSettings(s as Settings);
    setSlugInput((s as Settings)?.slug ?? "");
    const [{ data: t }, { data: r }, { data: a }] = await Promise.all([
      supabase.from("appointment_types").select("*").eq("business_id", active.id).order("sort_order"),
      supabase.from("booking_resources").select("*").eq("business_id", active.id).order("sort_order"),
      supabase.from("appointments").select("id, customer_name, customer_phone, starts_at, status")
        .eq("business_id", active.id).gte("starts_at", new Date().toISOString())
        .neq("status", "cancelled").order("starts_at").limit(50),
    ]);
    setTypes((t as ApptType[]) ?? []); setResources((r as Resource[]) ?? []); setAppts((a as Appt[]) ?? []);
    setLoading(false);
  }, [active?.id]);

  useEffect(() => { load(); }, [load]);

  const patch = async (p: Partial<Settings>) => {
    if (!settings || !active) return;
    setSettings({ ...settings, ...p });
    const { error } = await supabase.from("booking_settings").update(p).eq("business_id", active.id);
    if (error) Alert.alert("Couldn't save", error.message);
  };

  const saveSlug = async () => {
    if (!active) return;
    const clean = slugInput.trim().toLowerCase();
    if (!SLUG_RE.test(clean)) { Alert.alert("Invalid link", "Use 3–40 lowercase letters, numbers or hyphens."); return; }
    const { error } = await supabase.from("booking_settings").update({ slug: clean }).eq("business_id", active.id);
    if (error) { Alert.alert("Couldn't save", error.code === "23505" ? "That link is already taken." : error.message); return; }
    setSettings((s) => s ? { ...s, slug: clean } : s);
    Alert.alert("Saved", "Booking link updated.");
  };

  const publicUrl = settings?.slug ? `${APP_URL}/book/${settings.slug}` : null;

  const addType = async () => {
    if (!active || !newType.name.trim()) return;
    const { data, error } = await supabase.from("appointment_types").insert({
      business_id: active.id, name: newType.name.trim(), duration_minutes: parseInt(newType.minutes) || 60,
    }).select("*").single();
    if (error) { Alert.alert("Couldn't add", error.message); return; }
    setTypes((arr) => [...arr, data as ApptType]); setNewType({ name: "", minutes: "60" });
  };
  const delType = async (id: string) => { await supabase.from("appointment_types").delete().eq("id", id); setTypes((a) => a.filter((x) => x.id !== id)); };

  const addResource = async () => {
    if (!active || !newResource.trim()) return;
    const { data, error } = await supabase.from("booking_resources").insert({
      business_id: active.id, display_name: newResource.trim(),
    }).select("*").single();
    if (error) { Alert.alert("Couldn't add", error.message); return; }
    setResources((arr) => [...arr, data as Resource]); setNewResource("");
  };
  const delResource = async (id: string) => { await supabase.from("booking_resources").delete().eq("id", id); setResources((a) => a.filter((x) => x.id !== id)); };

  const setApptStatus = async (id: string, status: string) => {
    const p: Record<string, unknown> = { status };
    if (status === "cancelled") p.cancelled_at = new Date().toISOString();
    await supabase.from("appointments").update(p).eq("id", id);
    if (status === "cancelled") setAppts((a) => a.filter((x) => x.id !== id));
    else setAppts((a) => a.map((x) => x.id === id ? { ...x, status } : x));
  };

  const fmtWhen = (iso: string) => new Intl.DateTimeFormat("en-AU", {
    timeZone: settings?.timezone || "Australia/Sydney", weekday: "short", day: "numeric", month: "short",
    hour: "numeric", minute: "2-digit", hour12: true,
  }).format(new Date(iso));

  if (loading || !settings) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["top", "left", "right"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: space.lg, paddingVertical: space.sm, gap: space.sm }}>
        <Pressable onPress={() => router.back()} hitSlop={10}><ArrowLeft size={22} color={colors.text} /></Pressable>
        <CalendarClock size={18} color={colors.text} />
        <Text style={{ fontSize: 18, fontWeight: "700", color: colors.text }}>Online Booking</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        {!canEdit && <Text style={{ fontSize: 12, color: colors.muted }}>Read-only — owner or admin can edit.</Text>}

        {/* Enable + link */}
        <Section title="Status">
          <Row label="Online booking">
            <Switch value={settings.enabled} disabled={!canEdit}
              onValueChange={(v) => patch({ enabled: v })} trackColor={{ true: colors.primary }} />
          </Row>
          <Text style={{ fontSize: 11, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: "700", marginTop: 6 }}>Booking link</Text>
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <TextInput value={slugInput} onChangeText={setSlugInput} editable={canEdit} autoCapitalize="none" placeholder="your-business"
              placeholderTextColor={colors.muted}
              style={{ flex: 1, padding: space.sm + 2, borderRadius: radius.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.hairline, color: colors.text }} />
            {canEdit && <Pressable onPress={saveSlug} style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.md, backgroundColor: colors.primary }}><Text style={{ color: "#fff", fontWeight: "700" }}>Save</Text></Pressable>}
          </View>
          {publicUrl && (
            <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
              <Text selectable style={{ flex: 1, fontSize: 12, color: colors.primaryDeep }}>{publicUrl}</Text>
              <Pressable onPress={() => Share.share({ message: publicUrl })} hitSlop={8}><Share2 size={18} color={colors.text} /></Pressable>
            </View>
          )}
        </Section>

        {/* Upcoming */}
        <Section title="Upcoming bookings">
          {appts.length === 0 && <Text style={{ fontSize: 13, color: colors.muted }}>No upcoming bookings.</Text>}
          {appts.map((a) => (
            <View key={a.id} style={{ borderWidth: 1, borderColor: colors.hairline, borderRadius: radius.md, padding: space.sm + 2, marginBottom: 8 }}>
              <Text style={{ fontWeight: "700", color: colors.text }}>{a.customer_name}</Text>
              <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>{fmtWhen(a.starts_at)}{a.customer_phone ? ` · ${a.customer_phone}` : ""} · {a.status}</Text>
              {canEdit && (
                <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                  <MiniBtn label="Done" onPress={() => setApptStatus(a.id, "completed")} />
                  <MiniBtn label="No-show" onPress={() => setApptStatus(a.id, "no_show")} />
                  <MiniBtn label="Cancel" danger onPress={() => setApptStatus(a.id, "cancelled")} />
                </View>
              )}
            </View>
          ))}
        </Section>

        {/* Rules */}
        <Section title="Booking rules">
          <TextField label="Timezone" value={settings.timezone} editable={canEdit} onCommit={(v) => patch({ timezone: v })} />
          <NumField label="Min notice (minutes)" value={settings.min_lead_minutes} editable={canEdit} onCommit={(v) => patch({ min_lead_minutes: v })} />
          <NumField label="Book up to (days ahead)" value={settings.max_advance_days} editable={canEdit} onCommit={(v) => patch({ max_advance_days: v })} />
          <NumField label="Slot interval (minutes)" value={settings.slot_granularity_minutes} editable={canEdit} onCommit={(v) => patch({ slot_granularity_minutes: v })} />
          <NumField label="Buffer (minutes)" value={settings.default_buffer_minutes} editable={canEdit} onCommit={(v) => patch({ default_buffer_minutes: v })} />
          <NumField label="Cancellation notice (hours)" value={settings.cancellation_window_hours} editable={canEdit} onCommit={(v) => patch({ cancellation_window_hours: v })} />
          <Row label="Require phone"><Switch value={settings.require_phone} disabled={!canEdit} onValueChange={(v) => patch({ require_phone: v })} trackColor={{ true: colors.primary }} /></Row>
          <Row label="Require email"><Switch value={settings.require_email} disabled={!canEdit} onValueChange={(v) => patch({ require_email: v })} trackColor={{ true: colors.primary }} /></Row>
          <Row label="Require address"><Switch value={settings.require_address} disabled={!canEdit} onValueChange={(v) => patch({ require_address: v })} trackColor={{ true: colors.primary }} /></Row>
          <Row label="Create a lead per booking"><Switch value={settings.create_lead} disabled={!canEdit} onValueChange={(v) => patch({ create_lead: v })} trackColor={{ true: colors.primary }} /></Row>
          <Row label="Create a work order per booking"><Switch value={settings.create_work_order} disabled={!canEdit} onValueChange={(v) => patch({ create_work_order: v })} trackColor={{ true: colors.primary }} /></Row>
        </Section>

        {/* Services */}
        <Section title="Services">
          {types.map((t) => (
            <View key={t.id} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.hairline }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: "600", color: colors.text }}>{t.name}</Text>
                <Text style={{ fontSize: 12, color: colors.muted }}>{t.duration_minutes} min{t.price_display ? ` · ${t.price_display}` : ""}</Text>
              </View>
              {canEdit && <Pressable onPress={() => delType(t.id)} hitSlop={8}><Trash2 size={18} color={colors.muted} /></Pressable>}
            </View>
          ))}
          {canEdit && (
            <View style={{ flexDirection: "row", gap: 8, marginTop: 10, alignItems: "center" }}>
              <TextInput value={newType.name} onChangeText={(v) => setNewType({ ...newType, name: v })} placeholder="Service name" placeholderTextColor={colors.muted}
                style={{ flex: 1, padding: space.sm + 2, borderRadius: radius.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.hairline, color: colors.text }} />
              <TextInput value={newType.minutes} onChangeText={(v) => setNewType({ ...newType, minutes: v })} keyboardType="numeric" placeholder="min" placeholderTextColor={colors.muted}
                style={{ width: 56, padding: space.sm + 2, borderRadius: radius.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.hairline, color: colors.text }} />
              <Pressable onPress={addType} style={{ padding: 10, borderRadius: radius.md, backgroundColor: colors.primary }}><Plus size={18} color="#fff" /></Pressable>
            </View>
          )}
        </Section>

        {/* Resources */}
        <Section title="Team / resources">
          {resources.map((r) => (
            <ResourceRow key={r.id} resource={r} businessId={active!.id} canEdit={canEdit} onDelete={() => delResource(r.id)} />
          ))}
          {canEdit && (
            <View style={{ flexDirection: "row", gap: 8, marginTop: 10, alignItems: "center" }}>
              <TextInput value={newResource} onChangeText={setNewResource} placeholder="Display name (e.g. Sam)" placeholderTextColor={colors.muted}
                style={{ flex: 1, padding: space.sm + 2, borderRadius: radius.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.hairline, color: colors.text }} />
              <Pressable onPress={addResource} style={{ padding: 10, borderRadius: radius.md, backgroundColor: colors.primary }}><Plus size={18} color="#fff" /></Pressable>
            </View>
          )}
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.hairline, padding: space.md, gap: 6 }}>
      <Text style={{ fontSize: 13, fontWeight: "800", color: colors.text, marginBottom: 4 }}>{title}</Text>
      {children}
    </View>
  );
}
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 6 }}>
      <Text style={{ fontSize: 14, color: colors.text, flex: 1 }}>{label}</Text>{children}
    </View>
  );
}
function TextField({ label, value, editable, onCommit }: { label: string; value: string; editable: boolean; onCommit: (v: string) => void }) {
  const [v, setV] = useState(value);
  return (
    <View style={{ gap: 4, paddingVertical: 4 }}>
      <Text style={{ fontSize: 11, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: "700" }}>{label}</Text>
      <TextInput value={v} editable={editable} autoCapitalize="none" onChangeText={setV} onBlur={() => onCommit(v)}
        style={{ padding: space.sm + 2, borderRadius: radius.md, backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.hairline, color: colors.text }} />
    </View>
  );
}
function NumField({ label, value, editable, onCommit }: { label: string; value: number; editable: boolean; onCommit: (v: number) => void }) {
  const [v, setV] = useState(String(value));
  return (
    <View style={{ gap: 4, paddingVertical: 4 }}>
      <Text style={{ fontSize: 11, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: "700" }}>{label}</Text>
      <TextInput value={v} editable={editable} keyboardType="numeric" onChangeText={setV} onBlur={() => onCommit(Math.max(0, parseInt(v) || 0))}
        style={{ padding: space.sm + 2, borderRadius: radius.md, backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.hairline, color: colors.text }} />
    </View>
  );
}
function MiniBtn({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill ?? 999, borderWidth: 1, borderColor: danger ? "#f1aeae" : colors.hairline, backgroundColor: colors.canvas }}>
      <Text style={{ fontSize: 12, fontWeight: "700", color: danger ? "#c0392b" : colors.text }}>{label}</Text>
    </Pressable>
  );
}

function ResourceRow({ resource, businessId, canEdit, onDelete }: { resource: Resource; businessId: string; canEdit: boolean; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const [hours, setHours] = useState<{ enabled: boolean; start: string; end: string }[]>(
    DAYS.map(() => ({ enabled: false, start: "09:00", end: "17:00" })),
  );
  const [loaded, setLoaded] = useState(false);

  const expand = async () => {
    setOpen((o) => !o);
    if (!loaded) {
      const { data } = await supabase.from("booking_working_hours").select("*").eq("resource_id", resource.id);
      const next = DAYS.map((_, wd) => {
        const row = (data ?? []).find((r: { weekday: number }) => r.weekday === wd) as { start_time: string; end_time: string } | undefined;
        return row ? { enabled: true, start: row.start_time.slice(0, 5), end: row.end_time.slice(0, 5) } : { enabled: false, start: "09:00", end: "17:00" };
      });
      setHours(next); setLoaded(true);
    }
  };

  const saveHours = async () => {
    await supabase.from("booking_working_hours").delete().eq("resource_id", resource.id);
    const rows = hours.map((h, wd) => h.enabled ? { business_id: businessId, resource_id: resource.id, weekday: wd, start_time: h.start, end_time: h.end } : null).filter(Boolean);
    if (rows.length) {
      const { error } = await supabase.from("booking_working_hours").insert(rows as object[]);
      if (error) { Alert.alert("Couldn't save hours", error.message); return; }
    }
    Alert.alert("Saved", "Working hours updated.");
  };

  return (
    <View style={{ borderBottomWidth: 1, borderBottomColor: colors.hairline, paddingVertical: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={{ flex: 1, fontWeight: "600", color: colors.text }}>{resource.display_name}</Text>
        <Pressable onPress={expand}><Text style={{ color: colors.primaryDeep, fontWeight: "700", fontSize: 13 }}>{open ? "Hide" : "Hours"}</Text></Pressable>
        {canEdit && <Pressable onPress={onDelete} hitSlop={8}><Trash2 size={18} color={colors.muted} /></Pressable>}
      </View>
      {open && (
        <View style={{ marginTop: 8, gap: 6 }}>
          {DAYS.map((d, wd) => (
            <View key={d} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Switch value={hours[wd].enabled} disabled={!canEdit} onValueChange={(v) => setHours((h) => h.map((x, i) => i === wd ? { ...x, enabled: v } : x))} trackColor={{ true: colors.primary }} />
              <Text style={{ width: 34, color: colors.text }}>{d}</Text>
              <TextInput value={hours[wd].start} editable={canEdit && hours[wd].enabled} onChangeText={(t) => setHours((h) => h.map((x, i) => i === wd ? { ...x, start: t } : x))}
                style={{ width: 64, padding: 6, borderRadius: radius.sm, backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.hairline, color: colors.text, textAlign: "center" }} />
              <Text style={{ color: colors.muted }}>–</Text>
              <TextInput value={hours[wd].end} editable={canEdit && hours[wd].enabled} onChangeText={(t) => setHours((h) => h.map((x, i) => i === wd ? { ...x, end: t } : x))}
                style={{ width: 64, padding: 6, borderRadius: radius.sm, backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.hairline, color: colors.text, textAlign: "center" }} />
            </View>
          ))}
          {canEdit && <Pressable onPress={saveHours} style={{ alignSelf: "flex-start", paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.md, backgroundColor: colors.primary, marginTop: 4 }}><Text style={{ color: "#fff", fontWeight: "700" }}>Save hours</Text></Pressable>}
        </View>
      )}
    </View>
  );
}
