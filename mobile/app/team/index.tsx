import { useEffect, useState } from "react";
import {
  Alert, FlatList, Modal, Pressable, ScrollView, Text, TextInput, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import {
  ArrowLeft, Plus, Trash2, X, ShieldCheck, Users, Pencil, Hammer, Eye,
} from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import { useActiveBusiness } from "@/lib/active-business";
import { colors, radius, space } from "@/lib/theme";
import { Avatar } from "@/components/Avatar";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonRow } from "@/components/Skeleton";
import { BrandedRefresh } from "@/components/BrandedRefresh";
import { FadeIn } from "@/components/FadeIn";
import { AnimatedPress } from "@/components/AnimatedPress";

type Role = "admin" | "editor" | "viewer" | "worker";

interface Member {
  id:         string;
  email:      string;
  role:       Role;
  status:     "pending" | "active";
  user_id:    string | null;
  created_at: string;
}

interface RoleInfo {
  id:    Role;
  label: string;
  hint:  string;
  description: string;
  icon:  React.ReactNode;
  bg:    string;
  fg:    string;
}

const ROLES: Record<Role, RoleInfo> = {
  admin: {
    id: "admin", label: "Admin", hint: "Full access — like an owner",
    description: "Manage everything: sales, jobs, billing, team. Best for partners or office managers.",
    icon: <ShieldCheck size={18} color="#1d4ed8" />,
    bg: "#dbeafe", fg: "#1d4ed8",
  },
  editor: {
    id: "editor", label: "Editor", hint: "Can manage sales + jobs",
    description: "Create/edit customers, leads, quotes, invoices and jobs. Can't change settings, team, or bank details. Good for office staff and salespeople.",
    icon: <Pencil size={18} color="#6d28d9" />,
    bg: "#ede9fe", fg: "#6d28d9",
  },
  worker: {
    id: "worker", label: "Worker", hint: "On-site field crew",
    description: "Sees only their assigned jobs and tasks. Can update job status, add photos and notes, contact the customer. Doesn't see your books, quotes, or other workers' jobs.",
    icon: <Hammer size={18} color="#166534" />,
    bg: "#dcfce7", fg: "#166534",
  },
  viewer: {
    id: "viewer", label: "Viewer", hint: "Read-only access",
    description: "Can see everything but change nothing. Useful for accountants or silent partners reviewing the books.",
    icon: <Eye size={18} color="#374151" />,
    bg: "#e5e7eb", fg: "#374151",
  },
};

const STATUS_BADGE: Record<Member["status"], { bg: string; fg: string; label: string }> = {
  pending: { bg: "#fef3c7", fg: "#92400e", label: "Pending" },
  active:  { bg: "#dcfce7", fg: "#166534", label: "Active" },
};

/** Top-level Team management screen — owner/admin only.
 *  Add by email + role, change role inline, remove member. */
export default function TeamScreen() {
  const router = useRouter();
  const { active, role } = useActiveBusiness();
  const canManage = role === "owner" || role === "admin";

  const [members,    setMembers]    = useState<Member[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [modalOpen,  setModalOpen]  = useState(false);
  const [editing,    setEditing]    = useState<Member | null>(null);

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
    Alert.alert("Remove member?", `${m.email} will lose access to ${active?.name ?? "this business"}.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove", style: "destructive",
        onPress: async () => {
          const { error } = await supabase.from("business_members").delete().eq("id", m.id);
          if (error) Alert.alert("Couldn't remove", error.message);
          load();
        },
      },
    ]);
  };

  const changeRole = async (m: Member, r: Role) => {
    const { error } = await supabase.from("business_members").update({ role: r }).eq("id", m.id);
    if (error) { Alert.alert("Couldn't update", error.message); return; }
    setEditing(null);
    load();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["top", "left", "right"]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.sm, gap: space.sm }}>
        <Pressable onPress={() => router.back()} hitSlop={10}><ArrowLeft size={22} color={colors.text} /></Pressable>
        <Users size={18} color={colors.text} />
        <Text style={{ fontSize: 20, fontWeight: "800", color: colors.text }}>Team</Text>
        <View style={{ flex: 1 }} />
        {canManage && (
          <AnimatedPress onPress={() => setModalOpen(true)}
            style={{
              paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill,
              backgroundColor: colors.primary,
              flexDirection: "row", alignItems: "center", gap: 4,
            }}>
            <Plus size={14} color="#fff" />
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 12 }}>Invite</Text>
          </AnimatedPress>
        )}
      </View>

      {!members ? (
        <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm, gap: 4 }}>
          {Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} avatar />)}
        </View>
      ) : members.length === 0 ? (
        <EmptyState
          icon={<Users size={32} color="#fff" />}
          title="No one else yet"
          subtitle="Invite teammates by email. They join with the role you pick — you can change it later."
          ctaLabel={canManage ? "Invite member" : undefined}
          onPressCta={canManage ? () => setModalOpen(true) : undefined}
          gradient="primary"
        />
      ) : (
        <FlatList
          data={members}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: space.lg, gap: space.sm }}
          refreshControl={<BrandedRefresh refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
          renderItem={({ item, index }) => {
            const r  = ROLES[item.role] ?? ROLES.viewer;
            const sb = STATUS_BADGE[item.status];
            return (
              <FadeIn delay={Math.min(index * 30, 240)}>
                <View style={{ padding: space.md, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.hairline }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                    <Avatar name={item.email} size={40} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontSize: 14, fontWeight: "700", color: colors.text }} numberOfLines={1}>
                        {item.email}
                      </Text>
                      <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>{r.hint}</Text>
                    </View>
                    {canManage && (
                      <Pressable onPress={() => remove(item)} hitSlop={8} style={{ padding: 4 }}>
                        <Trash2 size={16} color="#991b1b" />
                      </Pressable>
                    )}
                  </View>
                  <View style={{ flexDirection: "row", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                    <Pressable onPress={canManage ? () => setEditing(item) : undefined} disabled={!canManage}
                      style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: r.bg, flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Text style={{ fontSize: 11, fontWeight: "800", color: r.fg, textTransform: "uppercase", letterSpacing: 0.5 }}>{r.label}</Text>
                      {canManage && (
                        <Text style={{ fontSize: 11, color: r.fg, opacity: 0.7 }}>·  Change</Text>
                      )}
                    </Pressable>
                    <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: sb.bg }}>
                      <Text style={{ fontSize: 11, fontWeight: "800", color: sb.fg, textTransform: "uppercase", letterSpacing: 0.5 }}>{sb.label}</Text>
                    </View>
                  </View>
                </View>
              </FadeIn>
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

      {editing && canManage && (
        <ChangeRoleModal
          member={editing}
          onClose={() => setEditing(null)}
          onPick={(r) => changeRole(editing, r)}
        />
      )}
    </SafeAreaView>
  );
}

function AddMemberModal({ businessId, onClose, onAdded }: {
  businessId: string; onClose: () => void; onAdded: () => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole]   = useState<Role>("worker");
  const [busy, setBusy]   = useState(false);

  const submit = async () => {
    const e = email.trim().toLowerCase();
    if (!e) { Alert.alert("Enter an email", "Member email is required."); return; }
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("business_members").insert({
      business_id: businessId, email: e, role, status: "pending", added_by: user?.id,
    });
    setBusy(false);
    if (error) { Alert.alert("Couldn't add", error.message); return; }
    onAdded();
  };

  const info = ROLES[role];

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["top", "left", "right"]}>
        <View style={{ flexDirection: "row", alignItems: "center", padding: space.lg }}>
          <Text style={{ flex: 1, fontSize: 20, fontWeight: "800", color: colors.text }}>Invite member</Text>
          <Pressable onPress={onClose} hitSlop={8}><X size={22} color={colors.text} /></Pressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingTop: 0 }} keyboardShouldPersistTaps="handled">
          <View style={{ gap: 6 }}>
            <Text style={lbl()}>Email *</Text>
            <TextInput
              value={email} onChangeText={setEmail}
              autoCapitalize="none" keyboardType="email-address"
              placeholder="teammate@example.com" placeholderTextColor={colors.muted}
              autoFocus
              style={inputStyle()}
            />
            <Text style={{ fontSize: 11, color: colors.muted, lineHeight: 16 }}>
              They sign up using this exact email. The seat lights up automatically on first login.
            </Text>
          </View>

          <View style={{ gap: 8 }}>
            <Text style={lbl()}>Access level</Text>
            {(Object.values(ROLES) as RoleInfo[]).map((r) => {
              const selected = r.id === role;
              return (
                <Pressable key={r.id} onPress={() => setRole(r.id)}
                  style={({ pressed }) => ({
                    padding: space.md, borderRadius: radius.lg,
                    backgroundColor: selected ? r.bg : pressed ? colors.muted : colors.card,
                    borderWidth: selected ? 2 : 1,
                    borderColor: selected ? r.fg : colors.hairline,
                    gap: 4,
                  })}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    {r.icon}
                    <Text style={{ flex: 1, fontSize: 15, fontWeight: "800", color: selected ? r.fg : colors.text }}>{r.label}</Text>
                    {selected && <Text style={{ fontSize: 11, fontWeight: "800", color: r.fg }}>SELECTED</Text>}
                  </View>
                  <Text style={{ fontSize: 12, color: selected ? r.fg : colors.muted, lineHeight: 17 }}>
                    {r.description}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable onPress={submit} disabled={busy}
            style={({ pressed }) => ({
              flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
              padding: space.md, borderRadius: radius.lg,
              backgroundColor: pressed ? colors.primaryDeep : colors.primary,
              opacity: busy ? 0.6 : 1,
            })}>
            <Text style={{ color: "#fff", fontSize: 15, fontWeight: "800" }}>
              {busy ? "Sending invite…" : `Invite as ${info.label}`}
            </Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function ChangeRoleModal({ member, onClose, onPick }: {
  member: Member;
  onClose: () => void;
  onPick: (r: Role) => void;
}) {
  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)" }} onPress={onClose}>
        <View style={{ marginTop: "auto", backgroundColor: colors.card, borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl, padding: space.lg, gap: space.md, maxHeight: "85%" }}>
          <Text style={{ fontSize: 17, fontWeight: "800", color: colors.text }}>Change access level</Text>
          <Text style={{ fontSize: 12, color: colors.muted }} numberOfLines={1}>{member.email}</Text>
          <ScrollView contentContainerStyle={{ gap: 8 }}>
            {(Object.values(ROLES) as RoleInfo[]).map((r) => {
              const current = r.id === member.role;
              return (
                <Pressable key={r.id} onPress={() => onPick(r.id)} disabled={current}
                  style={({ pressed }) => ({
                    padding: space.md, borderRadius: radius.lg,
                    backgroundColor: current ? r.bg : pressed ? colors.muted : colors.canvas,
                    borderWidth: 1, borderColor: current ? r.fg : colors.hairline,
                    gap: 4,
                  })}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    {r.icon}
                    <Text style={{ flex: 1, fontSize: 15, fontWeight: "800", color: current ? r.fg : colors.text }}>{r.label}</Text>
                    {current && <Text style={{ fontSize: 10, fontWeight: "800", color: r.fg }}>CURRENT</Text>}
                  </View>
                  <Text style={{ fontSize: 12, color: current ? r.fg : colors.muted, lineHeight: 17 }}>
                    {r.description}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </Pressable>
    </Modal>
  );
}

const lbl = () => ({ fontSize: 11, color: colors.muted, textTransform: "uppercase" as const, letterSpacing: 0.6, fontWeight: "700" as const });

const inputStyle = () => ({
  padding: space.sm + 2, borderRadius: radius.md,
  backgroundColor: colors.card, borderWidth: 1, borderColor: colors.hairline,
  color: colors.text, fontSize: 14,
});
