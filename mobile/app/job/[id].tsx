import { useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, Image, Linking, Modal, Platform,
  Pressable, ScrollView, Text, TextInput, View,
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
  fetchWorkOrder, setWorkOrderStatus, addWorkOrderPhoto, setWorkerNotes,
  fetchJobContacts, removeWorkOrderPhoto,
} from "@/lib/jobs";
import { uploadJobPhoto } from "@/lib/storage";
import { StatusPill } from "@/components/StatusPill";
import { colors, radius, space } from "@/lib/theme";
import type { WorkOrderStatus } from "@/lib/types";

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

  const { data: job, isLoading, error } = useQuery({
    queryKey: ["work-order", id],
    queryFn:  () => fetchWorkOrder(id!),
    enabled:  !!id,
  });

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
    mutationFn: async (localUri: string) => {
      const { url } = await uploadJobPhoto(localUri);
      await addWorkOrderPhoto(id!, { url, taken_at: new Date().toISOString() });
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.invalidateQueries({ queryKey: ["work-order", id] });
    },
    onError: (e: Error) => Alert.alert("Couldn't upload photo", e.message),
  });

  const deletePhotoMutation = useMutation({
    mutationFn: (url: string) => removeWorkOrderPhoto(id!, url),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.invalidateQueries({ queryKey: ["work-order", id] });
      setPhotoZoom(null);
    },
    onError: (e: Error) => Alert.alert("Couldn't delete", e.message),
  });

  if (isLoading) {
    return (
      <SafeAreaView style={center}>
        <ActivityIndicator color={colors.text} />
      </SafeAreaView>
    );
  }
  if (error || !job) {
    return (
      <SafeAreaView style={center}>
        <Text style={{ color: colors.muted }}>Couldn&apos;t load this job.</Text>
        <Pressable onPress={() => router.back()} style={backBtn}>
          <Text style={{ color: colors.white, fontWeight: "600" }}>Back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const photos = Array.isArray(job.photos) ? job.photos : [];
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
    if (!result.canceled) photoMutation.mutate(result.assets[0].uri);
  };

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert("Photo library disabled", "Enable photo library access in Settings.");
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      exif: false,
    });
    if (!result.canceled) photoMutation.mutate(result.assets[0].uri);
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
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: 40 }}>
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
            <Pressable onPress={() => openMaps(job.property_address!)} style={openMapsBtn}>
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
              backgroundColor: "#fafaf3",
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
              backgroundColor: colors.text,
              opacity: pressed || savingNotes || !notes.trim() ? 0.5 : 1,
            })}
          >
            <Text style={{ color: colors.white, fontWeight: "600", fontSize: 13 }}>
              {savingNotes ? "Saving…" : "Save notes"}
            </Text>
          </Pressable>
        </Card>

        {/* Status actions */}
        <View style={{ marginTop: space.md }}>
          <SectionLabel>Update status</SectionLabel>
          <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
            {job.status === "assigned" && (
              <BigAction
                color={colors.amber}
                fg={colors.amberDeep}
                icon={<Play size={16} color={colors.amberDeep} />}
                label="Start job"
                onPress={() => statusMutation.mutate({ status: "in_progress" })}
                busy={statusMutation.isPending}
              />
            )}
            {job.status === "in_progress" && (
              <BigAction
                color={colors.violet}
                fg={colors.violetDeep}
                icon={<Send size={16} color={colors.violetDeep} />}
                label="Submit for review"
                onPress={() => statusMutation.mutate({ status: "submitted" })}
                busy={statusMutation.isPending}
              />
            )}
            {(job.status === "submitted" || job.status === "reviewed") && (
              <BigAction
                color={colors.emerald}
                fg={colors.emeraldDeep}
                icon={<CheckCircle2 size={16} color={colors.emeraldDeep} />}
                label="Mark complete"
                onPress={() => statusMutation.mutate({ status: "completed" })}
                busy={statusMutation.isPending}
              />
            )}
          </View>
        </View>
      </ScrollView>

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

const center = {
  flex: 1, backgroundColor: colors.canvas,
  alignItems: "center" as const, justifyContent: "center" as const, gap: 12,
};
const backBtn = {
  marginTop: 12,
  paddingHorizontal: 16, paddingVertical: 10,
  backgroundColor: colors.text, borderRadius: 999,
};
const openMapsBtn = {
  marginTop: 12,
  alignSelf: "flex-start" as const,
  flexDirection: "row" as const,
  alignItems: "center" as const,
  paddingHorizontal: 14, paddingVertical: 8,
  backgroundColor: colors.primary, borderRadius: 999,
};

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
        backgroundColor: "#fafaf3",
        opacity: pressed || disabled ? 0.6 : 1,
      })}
    >
      {icon}
      <Text style={{ color: colors.text, fontWeight: "600", fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

function BigAction({
  color, fg, icon, label, onPress, busy,
}: {
  color: string; fg: string; icon: React.ReactNode; label: string; onPress: () => void; busy?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={({ pressed }) => ({
        flexGrow: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        paddingVertical: 14,
        paddingHorizontal: space.lg,
        borderRadius: radius.pill,
        backgroundColor: color,
        opacity: pressed || busy ? 0.7 : 1,
      })}
    >
      {icon}
      <Text style={{ color: fg, fontWeight: "700", fontSize: 14 }}>
        {busy ? "Updating…" : label}
      </Text>
    </Pressable>
  );
}
