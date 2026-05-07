import { useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, Modal, Pressable,
  RefreshControl, Text, TextInput, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { ArrowLeft, Plus, Trash2, X } from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import { useActiveBusiness } from "@/lib/active-business";
import { colors, radius, space } from "@/lib/theme";

type Role = "admin" | "editor" | "viewer" | "worker";

interface Member {
  id:         string;
  email:      string;
  role:       Role;
  status:     "pending" | "active";
  user_id:    string | null;
  created_at: string;
}

const ROLE_BADGE: Record<Role, { bg: string; fg: string; label: string }> = {
  admin:  { bg: "#dbeafe", fg: "#1d4ed8", label: "Admin" },
  editor: { bg: "#ede9fe", fg: "#6d28d9", label: "Editor" },
  viewer: { bg: "#e5e7eb", fg: "#374151", label: "Viewer" },
  worker: { bg: "#dcfce7", fg: "#166534", label: "Worker" },
};

const STATUS_BADGE: Record<Member["status"], { bg: string; fg: string; label: string }> = {
  pending: { bg: "#fef3c7", fg: "#92400e", label: "Pending" },
  active:  { bg: "#dcfce7", fg: "#166534", label: "Active" },
};

/** Manage team members for the active business — owner/admin only.
 *  Add by email + role; pending members claim their seat on first login
 *  (server-side trigger reconciles user_id by email, see web migration). */
export default function TeamSettings() {
  const router = useRouter();
  const { active, role } = useActiveBusiness();
  const canManage = role === "owner" || role === "admin";

  const [members,    setMembers]    = useState<Member[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [modalOpen,  setModalOpen]  = useState(false);

  const load = async () => {
    if (!active) return;
    const { data } = await supabase
      .from("business_members")
      .select("id, email, role, status, user_id, created_at")
      .eq("business_id", active.id)
      .order("created_at", { ascending: true });
    setMembers((data ?? []) as Member[]);
  };

  useEffect(() => { load(); }, [active?.id]);

  const remove = (m: Member) => {
    Alert.alert("Remove member?", `${m.email} will lose access to this business.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove", style: "destructive",
        onPress: async () => {
          await supabase.from("business_members").delete().eq("id", m.id);
          load();
        },
      },
    ]);
  };

  const changeRole = (m: Member) => {
    const next: Role[] = ["admin", "editor", "viewer", "worker"];
    Alert.alert("Change role", `Pick a new role for ${m.email}`,
      next.map((r) => ({
        text: ROLE_BADGE[r].label,
        onPress: async () => {
          await supabase.from("business_members").update({ role: r }).eq("id", m.id);
          load();
        },
      })).concat([{ text: "Cancel", style: "cancel" } as never])
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["top", "left", "right"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.sm, gap: space.sm }}>
        <Pressable onPress={() => router.back()} hitSlop={10}><ArrowLeft size={22} color={colors.text} /></Pressable>
        <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text }}>Team</Text>
        <View style={{ flex: 1 }} />
        {canManage && (
          <Pressable onPress={() => setModalOpen(true)} hitSlop={8}
            style={({ pressed }) => ({ padding: 6, borderRadius: 999, backgroundColor: pressed ? colors.muted : colors.primary })}>
            <Plus size={18} color="#fff" />
          </Pressable>
        )}
      </View>

      {!members ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={members}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: space.lg, gap: space.sm }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.primary} />}
          ListEmptyComponent={<Text style={{ color: colors.muted, textAlign: "center", marginTop: space.xl }}>No team members yet.</Text>}
          renderItem={({ item }) => {
            const rb = ROLE_BADGE[item.role];
            const sb = STATUS_BADGE[item.status];
            return (
              <View style={{ padding: space.md, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.hairline }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                  <Text style={{ flex: 1, fontSize: 14, fontWeight: "600", color: colors.text }} numberOfLines={1}>{item.email}</Text>
                  {canManage && (
                    <Pressable onPress={() => remove(item)} hitSlop={8}><Trash2 size={16} color="#991b1b" /></Pressable>
                  )}
                </View>
                <View style={{ flexDirection: "row", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                  <Pressable onPress={canManage ? () => changeRole(item) : undefined} disabled={!canManage}
                    style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: rb.bg }}>
                    <Text style={{ fontSize: 10, fontWeight: "700", color: rb.fg, textTransform: "uppercase", letterSpacing: 0.5 }}>{rb.label}</Text>
                  </Pressable>
                  <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: sb.bg }}>
                    <Text style={{ fontSize: 10, fontWeight: "700", color: sb.fg, textTransform: "uppercase", letterSpacing: 0.5 }}>{sb.label}</Text>
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}

      {modalOpen && active && (
        <AddMemberModal
          businessId={active.id}
          onClose={() => setModalOpen(false)}
          onAdded={() => { setModalOpen(false); load(); }}
        />
      )}
    </SafeAreaView>
  );
}

function AddMemberModal({ businessId, onClose, onAdded }: {
  businessId: string; onClose: () => void; onAdded: () => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("worker");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const e = email.trim().toLowerCase();
    if (!e) { Alert.alert("Enter an email", "Member email is required."); return; }
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("business_members").insert({
      business_id: businessId, email: e, role, status: "pending", added_by: user?.id,
    });
    setBusy(false);
    if (error) {
      Alert.alert("Couldn't add", error.message);
      return;
    }
    onAdded();
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>
        <View style={{ flex: 1, padding: space.lg, gap: space.md }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={{ flex: 1, fontSize: 20, fontWeight: "700", color: colors.text }}>Add member</Text>
            <Pressable onPress={onClose} hitSlop={8}><X size={22} color={colors.text} /></Pressable>
          </View>

          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 11, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: "700" }}>Email *</Text>
            <TextInput
              value={email} onChangeText={setEmail}
              autoCapitalize="none" keyboardType="email-address"
              placeholder="teammate@example.com" placeholderTextColor={colors.muted}
              style={{
                padding: space.sm + 2, borderRadius: radius.md,
                backgroundColor: colors.card, borderWidth: 1, borderColor: colors.hairline,
                color: colors.text, fontSize: 14,
              }}
            />
          </View>

          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 11, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: "700" }}>Role</Text>
            <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
              {(["admin", "editor", "viewer", "worker"] as Role[]).map((r) => {
                const selected = r === role;
                return (
                  <Pressable key={r} onPress={() => setRole(r)}
                    style={({ pressed }) => ({
                      paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
                      backgroundColor: selected ? colors.primary : pressed ? colors.muted : colors.card,
                      borderWidth: 1, borderColor: selected ? colors.primary : colors.hairline,
                    })}>
                    <Text style={{ fontSize: 12, fontWeight: "700", color: selected ? "#fff" : colors.text }}>{ROLE_BADGE[r].label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={{ fontSize: 11, color: colors.muted, lineHeight: 16 }}>
              The teammate signs up with this email and the seat lights up automatically on first login.
            </Text>
          </View>

          <Pressable onPress={submit} disabled={busy}
            style={({ pressed }) => ({
              flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
              padding: space.md, borderRadius: radius.lg,
              backgroundColor: pressed ? "#0d6e6a" : colors.primary,
              opacity: busy ? 0.6 : 1, marginTop: space.sm,
            })}>
            <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>{busy ? "Adding…" : "Add member"}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}
