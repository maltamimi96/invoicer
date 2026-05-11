import { useState } from "react";
import {
  Alert, FlatList, Modal, Pressable, RefreshControl, ScrollView, Text, TextInput, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, X, ListChecks } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import {
  fetchAllTasks, fetchMyTasksAll, setTaskStatus,
  createTask, updateTask, deleteTask,
  type TaskInput,
} from "@/lib/tasks";
import { useActiveBusiness } from "@/lib/active-business";
import { canEdit } from "@/lib/permissions";
import { colors, radius, space } from "@/lib/theme";
import { FadeIn } from "@/components/FadeIn";
import { AnimatedPress } from "@/components/AnimatedPress";
import { SkeletonRow } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";
import { BrandedRefresh } from "@/components/BrandedRefresh";
import type { Task } from "@/lib/types";

const STATUSES: Task["status"][]   = ["todo", "in_progress", "in_review", "done"];
const PRIORITIES: Task["priority"][] = ["low", "normal", "high", "urgent"];

const STATUS_LABEL: Record<Task["status"], string> = {
  todo:        "To do",
  in_progress: "In progress",
  in_review:   "In review",
  done:        "Done",
};

const STATUS_DOT: Record<Task["status"], string> = {
  todo:        "#9ca3af",
  in_progress: "#f59e0b",
  in_review:   "#a78bfa",
  done:        "#10b981",
};

const PRIORITY_COLOR: Record<Task["priority"], string> = {
  urgent: "#dc2626",
  high:   "#f59e0b",
  normal: "#6b7280",
  low:    "#9ca3af",
};

type Scope = "mine" | "all";
type ViewTab = "open" | "done";

export default function TasksScreen() {
  const qc = useQueryClient();
  const { active, role } = useActiveBusiness();
  const editable = canEdit(role);

  const [scope, setScope]       = useState<Scope>(editable ? "all" : "mine");
  const [tab, setTab]           = useState<ViewTab>("open");
  const [editing, setEditing]   = useState<Task | null>(null);
  const [creating, setCreating] = useState(false);

  const queryKey = ["tasks", scope, active?.id ?? "—"];
  const { data: tasks, isLoading, isRefetching, refetch } = useQuery({
    queryKey,
    queryFn: () => (scope === "all" && active) ? fetchAllTasks(active.id) : fetchMyTasksAll(),
    enabled: !!active,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["tasks"] });

  const statusMut = useMutation({
    mutationFn: ({ id, next }: { id: string; next: Task["status"] }) => setTaskStatus(id, next),
    onSuccess:  () => { Haptics.selectionAsync().catch(() => {}); invalidate(); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteTask(id),
    onSuccess:  () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); invalidate(); },
    onError:    (e: Error) => Alert.alert("Couldn't delete", e.message),
  });

  const list = (tasks ?? []).filter((t) => tab === "done" ? t.status === "done" : t.status !== "done");
  const counts = {
    open: (tasks ?? []).filter((t) => t.status !== "done").length,
    done: (tasks ?? []).filter((t) => t.status === "done").length,
  };

  const confirmDelete = (task: Task) =>
    Alert.alert("Delete task?", `"${task.title}" will be removed.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMut.mutate(task.id) },
    ]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["top", "left", "right"]}>
      <FlatList
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xxl }}
        ListHeaderComponent={
          <View>
            <View style={{ paddingTop: space.md, paddingBottom: space.lg, flexDirection: "row", alignItems: "flex-end", gap: space.sm }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 28, fontWeight: "800", color: colors.text, letterSpacing: -0.5 }}>Tasks</Text>
                <Text style={{ fontSize: 13, color: colors.muted, marginTop: 4 }}>
                  {counts.open} open · {counts.done} done
                </Text>
              </View>
              {editable && (
                <AnimatedPress
                  onPress={() => setCreating(true)}
                  style={{
                    paddingHorizontal: 14, paddingVertical: 10,
                    borderRadius: radius.pill,
                    backgroundColor: colors.primary,
                    flexDirection: "row", alignItems: "center", gap: 4,
                  }}>
                  <Plus size={16} color="#fff" />
                  <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}>New</Text>
                </AnimatedPress>
              )}
            </View>

            {/* Scope toggle (owner/admin/editor only) */}
            {editable && (
              <View style={{ flexDirection: "row", gap: 4, marginBottom: space.sm }}>
                <TabPill active={scope === "all"}  label="Team"  onPress={() => setScope("all")} />
                <TabPill active={scope === "mine"} label="Mine"  onPress={() => setScope("mine")} />
              </View>
            )}

            <View style={{ flexDirection: "row", gap: 4, marginBottom: space.md }}>
              <TabPill active={tab === "open"} label={`Open · ${counts.open}`} onPress={() => setTab("open")} />
              <TabPill active={tab === "done"} label={`Done · ${counts.done}`} onPress={() => setTab("done")} />
            </View>
          </View>
        }
        refreshControl={<BrandedRefresh refreshing={isRefetching} onRefresh={refetch} />}
        data={isLoading ? [] : list}
        keyExtractor={(t) => t.id}
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={7}
        removeClippedSubviews
        renderItem={({ item, index }) => (
          <FadeIn delay={Math.min(index * 30, 240)}>
            <Row
              task={item}
              editable={editable || item.assignee_user_id === (tasks ?? [])[0]?.assignee_user_id}
              onCycleStatus={() => statusMut.mutate({
                id: item.id,
                next: cycleStatus(item.status),
              })}
              onChangeStatus={(s) => statusMut.mutate({ id: item.id, next: s })}
              onEdit={() => setEditing(item)}
              onDelete={() => confirmDelete(item)}
            />
          </FadeIn>
        )}
        ListEmptyComponent={
          isLoading ? (
            <View style={{ gap: 8 }}>
              {Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)}
            </View>
          ) : (
            <EmptyState
              icon={<ListChecks size={32} color="#fff" />}
              title={tab === "open" ? "No tasks here" : "Nothing completed yet"}
              subtitle={tab === "open"
                ? (editable ? "Add a task to track what needs doing." : "Nothing assigned to you right now.")
                : "Completed tasks will appear here."}
              ctaLabel={editable && tab === "open" ? "New task" : undefined}
              onPressCta={editable && tab === "open" ? () => setCreating(true) : undefined}
              gradient="primary"
            />
          )
        }
      />

      {creating && active && (
        <TaskEditor
          mode="create"
          onClose={() => setCreating(false)}
          onSubmit={async (input) => {
            try { await createTask(active.id, input); invalidate(); setCreating(false); }
            catch (e) { Alert.alert("Couldn't create", e instanceof Error ? e.message : "Unknown error"); }
          }}
        />
      )}

      {editing && (
        <TaskEditor
          mode="edit"
          initial={editing}
          onClose={() => setEditing(null)}
          onSubmit={async (input) => {
            try { await updateTask(editing.id, input); invalidate(); setEditing(null); }
            catch (e) { Alert.alert("Couldn't save", e instanceof Error ? e.message : "Unknown error"); }
          }}
          onDelete={() => { setEditing(null); confirmDelete(editing); }}
        />
      )}
    </SafeAreaView>
  );
}

function cycleStatus(s: Task["status"]): Task["status"] {
  const next: Record<Task["status"], Task["status"]> = {
    todo: "in_progress", in_progress: "in_review", in_review: "done", done: "todo",
  };
  return next[s];
}

function TabPill({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        paddingHorizontal: 12, paddingVertical: 6,
        borderRadius: radius.pill,
        backgroundColor: active ? colors.text : colors.card,
        borderWidth: 1,
        borderColor: active ? colors.text : colors.hairline,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Text style={{ fontSize: 12, fontWeight: "700", color: active ? colors.white : colors.muted }}>
        {label}
      </Text>
    </Pressable>
  );
}

function Row({ task, editable, onCycleStatus, onChangeStatus, onEdit, onDelete }: {
  task: Task;
  editable: boolean;
  onCycleStatus: () => void;
  onChangeStatus: (s: Task["status"]) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const checked = task.status === "done";
  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.hairline,
        padding: space.md,
        marginBottom: space.sm,
        gap: space.sm,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space.sm }}>
        <Pressable hitSlop={8} onPress={onCycleStatus}
          style={{
            width: 18, height: 18, borderRadius: 9,
            backgroundColor: STATUS_DOT[task.status], marginTop: 4,
          }}
        />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Pressable onPress={onEdit} hitSlop={4} disabled={!editable}>
            <Text
              style={{
                fontSize: 14, fontWeight: "700",
                color: checked ? colors.muted : colors.text,
                textDecorationLine: checked ? "line-through" : "none",
              }}
            >
              {task.title}
            </Text>
          </Pressable>
          {task.description ? (
            <Text numberOfLines={2} style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
              {task.description}
            </Text>
          ) : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6, alignItems: "center" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: PRIORITY_COLOR[task.priority] }} />
              <Text style={{ fontSize: 11, color: colors.muted, fontWeight: "600" }}>{task.priority}</Text>
            </View>
            <Text style={{ fontSize: 11, color: colors.muted }}>· {STATUS_LABEL[task.status]}</Text>
            {task.due_date && (
              <Text style={{ fontSize: 11, color: colors.muted }}>· due {task.due_date}</Text>
            )}
          </View>
        </View>
        {editable && (
          <View style={{ flexDirection: "row", gap: 4 }}>
            <Pressable onPress={onEdit} hitSlop={6} style={{ padding: 4 }}>
              <Pencil size={15} color={colors.muted} />
            </Pressable>
            <Pressable onPress={onDelete} hitSlop={6} style={{ padding: 4 }}>
              <Trash2 size={15} color="#dc2626" />
            </Pressable>
          </View>
        )}
      </View>

      {/* Status quick-change pills */}
      {editable && (
        <View style={{ flexDirection: "row", gap: 4, flexWrap: "wrap", borderTopWidth: 1, borderTopColor: colors.hairline, paddingTop: 8 }}>
          {STATUSES.map((s) => {
            const active = s === task.status;
            return (
              <Pressable key={s} onPress={() => onChangeStatus(s)} disabled={active}
                style={({ pressed }) => ({
                  paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill,
                  backgroundColor: active ? STATUS_DOT[s] : pressed ? colors.muted : "transparent",
                  borderWidth: 1, borderColor: active ? STATUS_DOT[s] : colors.hairline,
                })}>
                <Text style={{ fontSize: 10, fontWeight: "800", color: active ? "#fff" : colors.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>
                  {STATUS_LABEL[s]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

function TaskEditor({ mode, initial, onClose, onSubmit, onDelete }: {
  mode: "create" | "edit";
  initial?: Task;
  onClose: () => void;
  onSubmit: (input: TaskInput) => Promise<void>;
  onDelete?: () => void;
}) {
  const [title,       setTitle]       = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [status,      setStatus]      = useState<Task["status"]>(initial?.status ?? "todo");
  const [priority,    setPriority]    = useState<Task["priority"]>(initial?.priority ?? "normal");
  const [dueDate,     setDueDate]     = useState(initial?.due_date ?? "");
  const [busy,        setBusy]        = useState(false);

  const submit = async () => {
    if (!title.trim()) { Alert.alert("Title required"); return; }
    setBusy(true);
    try {
      await onSubmit({
        title,
        description: description || null,
        status, priority,
        due_date: dueDate || null,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["top", "left", "right"]}>
        <View style={{ flexDirection: "row", alignItems: "center", padding: space.lg, gap: space.sm }}>
          <Pressable onPress={onClose} hitSlop={10}><X size={22} color={colors.text} /></Pressable>
          <Text style={{ flex: 1, fontSize: 18, fontWeight: "800", color: colors.text }}>
            {mode === "create" ? "New task" : "Edit task"}
          </Text>
          {onDelete && (
            <Pressable onPress={onDelete} hitSlop={8} style={{ padding: 4 }}>
              <Trash2 size={18} color="#dc2626" />
            </Pressable>
          )}
        </View>

        <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md }} keyboardShouldPersistTaps="handled">
          <Field label="Title *">
            <TextInput
              value={title} onChangeText={setTitle}
              placeholder="Follow up with the Smith quote"
              placeholderTextColor={colors.muted}
              autoFocus={mode === "create"}
              style={inputStyle()}
            />
          </Field>

          <Field label="Description">
            <TextInput
              value={description} onChangeText={setDescription}
              placeholder="Any context worth saving…"
              placeholderTextColor={colors.muted}
              multiline
              style={[inputStyle(), { minHeight: 80, textAlignVertical: "top" }]}
            />
          </Field>

          <Field label="Status">
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {STATUSES.map((s) => (
                <Pill key={s} active={status === s} onPress={() => setStatus(s)}
                  label={STATUS_LABEL[s]} colour={STATUS_DOT[s]} />
              ))}
            </View>
          </Field>

          <Field label="Priority">
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {PRIORITIES.map((p) => (
                <Pill key={p} active={priority === p} onPress={() => setPriority(p)}
                  label={p} colour={PRIORITY_COLOR[p]} />
              ))}
            </View>
          </Field>

          <Field label="Due date (YYYY-MM-DD, optional)">
            <TextInput
              value={dueDate} onChangeText={setDueDate}
              placeholder="2026-05-20"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              style={inputStyle()}
            />
          </Field>

          <Pressable onPress={submit} disabled={busy}
            style={({ pressed }) => ({
              flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
              padding: space.md, borderRadius: radius.lg,
              backgroundColor: pressed ? colors.primaryDeep : colors.primary,
              opacity: busy ? 0.6 : 1, marginTop: space.sm,
            })}>
            <Text style={{ color: "#fff", fontSize: 15, fontWeight: "800" }}>
              {busy ? "Saving…" : mode === "create" ? "Create task" : "Save changes"}
            </Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function Pill({ active, label, onPress, colour }: { active: boolean; label: string; onPress: () => void; colour: string }) {
  return (
    <Pressable onPress={onPress}
      style={({ pressed }) => ({
        paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill,
        backgroundColor: active ? colour : pressed ? colors.muted : colors.card,
        borderWidth: 1, borderColor: active ? colour : colors.hairline,
      })}>
      <Text style={{ fontSize: 11, fontWeight: "800", color: active ? "#fff" : colors.text, textTransform: "uppercase", letterSpacing: 0.5 }}>
        {label}
      </Text>
    </Pressable>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 11, color: colors.muted, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 }}>
        {label}
      </Text>
      {children}
    </View>
  );
}

const inputStyle = () => ({
  padding: space.sm + 2, borderRadius: radius.md,
  backgroundColor: colors.card, borderWidth: 1, borderColor: colors.hairline,
  color: colors.text, fontSize: 14,
});
