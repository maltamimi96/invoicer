import { useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, Image, Linking, Modal, Platform,
  Pressable, RefreshControl, ScrollView, Text, TextInput, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import {
  ArrowLeft, MapPin, Phone, Mail, User, Calendar, Clock,
  Camera, Image as ImageIcon, Send, Play, CheckCircle2, X, Trash2, Briefcase,
} from "lucide-react-native";
import {
  fetchWorkOrder, setWorkOrderStatus, addWorkOrderPhoto, setWorkerNotes, fetchJobPhotos,
  fetchJobContacts, removeWorkOrderPhoto,
} from "@/lib/jobs";
import { uploadJobPhoto } from "@/lib/storage";
import { StatusPill } from "@/components/StatusPill";
import { Button } from "@/components/Button";
import { colors, cardShadow, radius, space } from "@/lib/theme";
import type { WorkOrderStatus } from "@/lib/types";

/** The single next status a worker can advance this job to, if any. Drives the
 *  sticky bottom CTA — one clear action instead of a row of coloured buttons. */
function nextStatusAction(status: string): { label: string; to: WorkOrderStatus; Icon: typeof Play } | null {
  if (status === "assigned")    return { label: "Start job",         to: "in_progress", Icon: Play };
  if (status === "in_progress") return { label: "Submit for review", to: "submitted",   Icon: Send };
  if (status === "submitted" || status === "reviewed")
    return { label: "Mark complete", to: "completed", Icon: CheckCircle2 };
  return null;
}

/** Native maps deep-link — Apple Maps on iOS, Google Maps everywhere else. */
function openMaps(address: string) {
  const q = encodeURIComponent(address);
  const url = Platform.OS === "ios"
    ? `https://maps.apple.com/?q=${q}`
    : `https://maps.google.com/?q=${q}`;
  Linking.openURL(url);
}

export default function JobDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  const { data: job, isLoading, error, refetch: refetchJob } = useQuery({
    queryKey: ["work-order", id],
    queryFn:  () => fetchWorkOrder(id!),
    enabled:  !!id,
  });

  // Photos come from job_photos, the canonical table the web writes to.
  // Separate query so a pull-to-refresh or an invalidate after upload re-reads
  // them without refetching the whole work order.
  const { data: jobPhotos, refetch: refetchPhotos } = useQuery({
    queryKey: ["job-photos", id],
    queryFn:  () => fetchJobPhotos(id!),
    enabled:  !!id,
  });

  // This screen had NO refresh mechanism — a plain ScrollView, no
  // RefreshControl — so once it was open there was no way to pull in a change
  // made on the web. With the client's 30s staleTime, even leaving and coming
  // straight back served the cached copy. Deleting a photo on the web and
  // "refreshing" the phone genuinely could not work.
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([refetchJob(), refetchPhotos()]);
    } finally {
      setRefreshing(false);
    }
  };

  // Load per-account contacts (booker + onsite) so the worker has someone to
  // call about the actual job, not just the master customer record.
  const { data: jobContacts } = useQuery({
    queryKey: ["work-order-contacts", id, job?.booker_contact_id, job?.onsite_contact_id],
    queryFn:  () => fetchJobContacts(job?.booker_contact_id, job?.onsite_contact_id),
    enabled:  !!job,
  });

  const [notes, setNotes] = useState<string>("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [photoZoom, setPhotoZoom] = useState<string | null>(null);

  // Pre-fill notes with whatever's been saved already so the worker can edit
  // their own notes instead of starting blank every time.
  useEffect(() => {
    if (job?.worker_notes && !notes) setNotes(job.worker_notes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.worker_notes]);

  const statusMutation = useMutation({
    mutationFn: ({ status }: { status: WorkOrderStatus }) => setWorkOrderStatus(id!, status),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.invalidateQueries({ queryKey: ["work-order", id] });
      qc.invalidateQueries({ queryKey: ["work-orders"] });
    },
    onError: (e: Error) => Alert.alert("Couldn't update status", e.message),
  });

  const photoMutation = useMutation({
    // Accepts one OR many local URIs — uploads them sequentially so a worker
    // can add a whole batch from the library in one go.
    mutationFn: async (localUris: string[]) => {
      for (const uri of localUris) {
        const { url } = await uploadJobPhoto(uri);
        await addWorkOrderPhoto(id!, { url, taken_at: new Date().toISOString() });
      }
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // job-photos is the display source now — invalidating only "work-order"
      // would leave the freshly uploaded photo invisible until a cold reload.
      qc.invalidateQueries({ queryKey: ["job-photos", id] });
      qc.invalidateQueries({ queryKey: ["work-order", id] });
    },
    onError: (e: Error) => Alert.alert("Couldn't upload photo", e.message),
  });

  const deletePhotoMutation = useMutation({
    mutationFn: (url: string) => removeWorkOrderPhoto(id!, url),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.invalidateQueries({ queryKey: ["job-photos", id] });
      qc.invalidateQueries({ queryKey: ["work-order", id] });
      setPhotoZoom(null);
    },
    onError: (e: Error) => Alert.alert("Couldn't delete", e.message),
  });

  if (isLoading) {
    return (
      <SafeAreaView style={center()}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }
  if (error || !job) {
    return (
      <SafeAreaView style={center()}>
        <Text style={{ color: colors.muted }}>Couldn&apos;t load this job.</Text>
        <Pressable onPress={() => router.back()} style={backBtn()}>
          <Text style={{ color: colors.white, fontWeight: "600" }}>Back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const action = nextStatusAction(job.status);

  // Canonical source. Was `job.photos` (the legacy JSONB), which only the
  // phone ever wrote to — so anything added or removed on the web never showed
  // up here. See fetchJobPhotos for the full story.
  const photos = jobPhotos ?? [];
  const customerPhone = job.customers?.phone ?? null;
  const customerEmail = job.customers?.email ?? null;

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return Alert.alert("Camera disabled", "Enable camera access in Settings.");
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      exif: false,
    });
    if (!result.canceled) photoMutation.mutate(result.assets.map((a) => a.uri));
  };

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert("Photo library disabled", "Enable photo library access in Settings.");
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,   // pick a batch at once
      selectionLimit: 0,               // 0 = unlimited
      quality: 0.7,
      exif: false,
    });
    if (!result.canceled) photoMutation.mutate(result.assets.map((a) => a.uri));
  };

  const saveNotes = async () => {
    if (!notes.trim()) return;
    setSavingNotes(true);
    try {
      await setWorkerNotes(job.id, notes.trim());
      Alert.alert("Saved", "Your notes were saved.");
    } catch (e) {
      Alert.alert("Couldn't save notes", (e as Error).message);
    } finally {
      setSavingNotes(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["top", "left", "right"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        contentContainerStyle={{ padding: space.lg, paddingBottom: action ? 120 : 40 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {/* Top bar */}
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: space.lg }}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={10}
            style={{
              backgroundColor: colors.card,
              width: 40, height: 40, borderRadius: 20,
              alignItems: "center", justifyContent: "center",
              borderWidth: 1, borderColor: colors.hairline,
            }}
          >
            <ArrowLeft size={18} color={colors.text} />
          </Pressable>
        </View>

        {/* Title block */}
        <View style={{ marginBottom: space.lg }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, marginBottom: 6 }}>
            <Text style={{ fontSize: 12, color: colors.muted, fontFamily: "monospace" }}>{job.number}</Text>
            <StatusPill status={job.status} />
          </View>
          <Text style={{ fontSize: 26, fontWeight: "700", color: colors.text, letterSpacing: -0.4 }}>
            {job.title}
          </Text>
          {job.description && (
            <Text style={{ marginTop: 6, fontSize: 14, color: colors.muted, lineHeight: 20 }}>
              {job.description}
            </Text>
          )}
        </View>

        {/* Reported issue (booker context) */}
        {job.reported_issue && (
          <Card>
            <SectionLabel>Reported issue</SectionLabel>
            <Text style={{ color: colors.text, lineHeight: 20 }}>{job.reported_issue}</Text>
          </Card>
        )}

        {/* When */}
        {(job.scheduled_date || job.start_time) && (
          <Card>
            <SectionLabel>When</SectionLabel>
            <Row icon={<Calendar size={16} color={colors.muted} />} label="Scheduled" value={job.scheduled_date ?? "Not scheduled"} />
            {(job.start_time || job.end_time) && (
              <Row
                icon={<Clock size={16} color={colors.muted} />}
                label="Window"
                value={`${(job.start_time ?? "").slice(0, 5) || "?"} – ${(job.end_time ?? "").slice(0, 5) || "?"}`}
              />
            )}
          </Card>
        )}

        {/* Where */}
        {job.property_address && (
          <Card>
            <SectionLabel>Where</SectionLabel>
            <Row icon={<MapPin size={16} color={colors.muted} />} label="Address" value={job.property_address} />
            <Pressable onPress={() => openMaps(job.property_address!)} style={openMapsBtn()}>
              <MapPin size={14} color={colors.white} />
              <Text style={{ color: colors.white, fontWeight: "700", marginLeft: 6 }}>
                {Platform.OS === "ios" ? "Open in Apple Maps" : "Open in Google Maps"}
              </Text>
            </Pressable>
          </Card>
        )}

        {/* Booker (who requested the job) */}
        {jobContacts?.booker && (
          <Card>
            <SectionLabel>Booker</SectionLabel>
            <Row
              icon={<Briefcase size={16} color={colors.muted} />}
              label="Requested by"
              value={`${jobContacts.booker.name}${jobContacts.booker.role ? ` · ${jobContacts.booker.role}` : ""}`}
            />
            {jobContacts.booker.phone && (
              <PressableRow
                icon={<Phone size={16} color={colors.muted} />}
                label="Call"
                value={jobContacts.booker.phone}
                onPress={() => Linking.openURL(`tel:${jobContacts.booker!.phone}`)}
              />
            )}
            {jobContacts.booker.email && (
              <PressableRow
                icon={<Mail size={16} color={colors.muted} />}
                label="Email"
                value={jobContacts.booker.email}
                onPress={() => Linking.openURL(`mailto:${jobContacts.booker!.email}`)}
              />
            )}
          </Card>
        )}

        {/* On-site contact */}
        {jobContacts?.onsite && (
          <Card>
            <SectionLabel>On-site contact</SectionLabel>
            <Row
              icon={<User size={16} color={colors.muted} />}
              label="Meet"
              value={`${jobContacts.onsite.name}${jobContacts.onsite.role ? ` · ${jobContacts.onsite.role}` : ""}`}
            />
            {jobContacts.onsite.phone && (
              <PressableRow
                icon={<Phone size={16} color={colors.muted} />}
                label="Call"
                value={jobContacts.onsite.phone}
                onPress={() => Linking.openURL(`tel:${jobContacts.onsite!.phone}`)}
              />
            )}
          </Card>
        )}

        {/* Customer + contact */}
        {job.customers?.name && (
          <Card>
            <SectionLabel>Customer</SectionLabel>
            <Row icon={<User size={16} color={colors.muted} />} label="Name"
                 value={`${job.customers.name}${job.customers.company ? ` · ${job.customers.company}` : ""}`} />
            {customerPhone && (
              <PressableRow
                icon={<Phone size={16} color={colors.muted} />}
                label="Call"
                value={customerPhone}
                onPress={() => Linking.openURL(`tel:${customerPhone}`)}
              />
            )}
            {customerEmail && (
              <PressableRow
                icon={<Mail size={16} color={colors.muted} />}
                label="Email"
                value={customerEmail}
                onPress={() => Linking.openURL(`mailto:${customerEmail}`)}
              />
            )}
          </Card>
        )}

        {/* Photos */}
        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: space.md }}>
            <SectionLabel inline>Photos</SectionLabel>
            <Text style={{ fontSize: 11, color: colors.muted }}>{photos.length} attached</Text>
          </View>

          {photos.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: space.md }}>
              {photos.map((p, i) => (
                <Pressable key={`${p.url}-${i}`} onPress={() => setPhotoZoom(p.url)}>
                  <Image
                    source={{ uri: p.url }}
                    style={{ width: 96, height: 96, borderRadius: radius.md, marginRight: space.sm, backgroundColor: "#eee" }}
                  />
                </Pressable>
              ))}
            </ScrollView>
          )}

          <View style={{ flexDirection: "row", gap: space.sm }}>
            <PhotoButton icon={<Camera size={16} color={colors.text} />} label={photoMutation.isPending ? "Uploading…" : "Take photo"} onPress={takePhoto} disabled={photoMutation.isPending} />
            <PhotoButton icon={<ImageIcon size={16} color={colors.text} />} label="From library" onPress={pickPhoto} disabled={photoMutation.isPending} />
          </View>
        </Card>

        {/* Worker notes */}
        <Card>
          <SectionLabel>Notes for the office</SectionLabel>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder={job.worker_notes ?? "What did you find on site? Any extra work needed?"}
            placeholderTextColor={colors.muted}
            multiline
            style={{
              minHeight: 100,
              textAlignVertical: "top",
              borderRadius: radius.md,
              backgroundColor: colors.surface2,
              padding: 12,
              fontSize: 14,
              color: colors.text,
              borderWidth: 1,
              borderColor: colors.hairline,
            }}
          />
          <Pressable
            onPress={saveNotes}
            disabled={savingNotes || !notes.trim()}
            style={({ pressed }) => ({
              marginTop: space.sm,
              alignSelf: "flex-end",
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: radius.pill,
              backgroundColor: colors.primary,
              opacity: pressed || savingNotes || !notes.trim() ? 0.5 : 1,
            })}
          >
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>
              {savingNotes ? "Saving…" : "Save notes"}
            </Text>
          </Pressable>
        </Card>

      </ScrollView>

      {/* Sticky status CTA — one clear next action, delivery-app style. */}
      {action && (
        <View
          style={{
            position: "absolute", left: 0, right: 0, bottom: 0,
            paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.xl,
            backgroundColor: colors.canvas,
            borderTopWidth: 1, borderTopColor: colors.hairline,
          }}
        >
          <Button
            label={statusMutation.isPending ? "Updating…" : action.label}
            icon={<action.Icon size={18} color="#fff" />}
            loading={statusMutation.isPending}
            onPress={() => statusMutation.mutate({ status: action.to })}
          />
        </View>
      )}

      {/* Full-screen photo viewer w/ delete */}
      <Modal visible={!!photoZoom} transparent animationType="fade" onRequestClose={() => setPhotoZoom(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.92)", justifyContent: "center" }}>
          <Pressable
            onPress={() => setPhotoZoom(null)}
            hitSlop={12}
            style={{ position: "absolute", top: 56, right: 20, zIndex: 2,
                     width: 36, height: 36, borderRadius: 18,
                     backgroundColor: "rgba(255,255,255,0.12)",
                     alignItems: "center", justifyContent: "center" }}
          >
            <X size={18} color={colors.white} />
          </Pressable>
          {photoZoom && (
            <Image
              source={{ uri: photoZoom }}
              style={{ width: "100%", height: "70%", resizeMode: "contain" }}
            />
          )}
          <Pressable
            onPress={() => {
              if (!photoZoom) return;
              Alert.alert("Delete photo?", "This can't be undone.", [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Delete", style: "destructive",
                  onPress: () => deletePhotoMutation.mutate(photoZoom),
                },
              ]);
            }}
            disabled={deletePhotoMutation.isPending}
            style={{ position: "absolute", bottom: 60, alignSelf: "center",
                     flexDirection: "row", alignItems: "center", gap: 6,
                     paddingHorizontal: 14, paddingVertical: 10,
                     backgroundColor: "rgba(220, 38, 38, 0.95)",
                     borderRadius: radius.pill }}
          >
            <Trash2 size={14} color={colors.white} />
            <Text style={{ color: colors.white, fontWeight: "700", fontSize: 13 }}>
              {deletePhotoMutation.isPending ? "Deleting…" : "Delete photo"}
            </Text>
          </Pressable>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// Functions, not module consts: `colors` is mutated in place by applyTheme(),
// so a const captured at import time freezes the light palette (the dark-mode
// trap in CLAUDE.md). `center` reads colors.canvas — as a const it would paint
// a white loading screen on the dark canvas.
const center = () => ({
  flex: 1, backgroundColor: colors.canvas,
  alignItems: "center" as const, justifyContent: "center" as const, gap: 12,
});
const backBtn = () => ({
  marginTop: 12,
  paddingHorizontal: 16, paddingVertical: 10,
  backgroundColor: colors.primary, borderRadius: 999,
});
const openMapsBtn = () => ({
  marginTop: 12,
  alignSelf: "flex-start" as const,
  flexDirection: "row" as const,
  alignItems: "center" as const,
  paddingHorizontal: 14, paddingVertical: 8,
  backgroundColor: colors.primary, borderRadius: 999,
});

function Card({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderRadius: radius.xl,
        padding: space.lg,
        marginBottom: space.md,
        borderWidth: 1,
        borderColor: colors.hairline,
        ...cardShadow(1),
      }}
    >
      {children}
    </View>
  );
}

function SectionLabel({ children, inline }: { children: React.ReactNode; inline?: boolean }) {
  return (
    <Text
      style={{
        fontSize: 11,
        fontWeight: "700",
        color: colors.muted,
        textTransform: "uppercase",
        letterSpacing: 1,
        marginBottom: inline ? 0 : space.sm,
      }}
    >
      {children}
    </Text>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, marginVertical: 4 }}>
      <View style={{ marginTop: 2 }}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 11, color: colors.muted, fontWeight: "600" }}>{label}</Text>
        <Text style={{ fontSize: 15, color: colors.text, marginTop: 1 }}>{value}</Text>
      </View>
    </View>
  );
}

function PressableRow({ icon, label, value, onPress }: { icon: React.ReactNode; label: string; value: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
      <Row icon={icon} label={label} value={value} />
    </Pressable>
  );
}

function PhotoButton({ icon, label, onPress, disabled }: { icon: React.ReactNode; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        paddingVertical: 12,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: colors.hairline,
        backgroundColor: colors.surface2,
        opacity: pressed || disabled ? 0.6 : 1,
      })}
    >
      {icon}
      <Text style={{ color: colors.text, fontWeight: "600", fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

