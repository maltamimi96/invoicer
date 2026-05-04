import { useState } from "react";
import {
  ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle, Circle, Clock, Tag } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { fetchMyTasksAll, setTaskStatus } from "@/lib/tasks";
import { colors, radius, space } from "@/lib/theme";
import type { Task } from "@/lib/types";

const PRIORITY_COLOR: Record<Task["priority"], string> = {
  urgent: "#dc2626",
  high:   "#f59e0b",
  normal: colors.muted,
  low:    colors.subtle,
};

const STATUS_LABEL: Record<Task["status"], string> = {
  todo:        "To do",
  in_progress: "In progress",
  in_review:   "In review",
  done:        "Done",
};

export default function TasksScreen() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"open" | "done">("open");
  const { data: tasks, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ["tasks-mine"],
    queryFn:  fetchMyTasksAll,
  });

  const toggle = useMutation({
    mutationFn: ({ id, next }: { id: string; next: Task["status"] }) => setTaskStatus(id, next),
    onSuccess:  () => { Haptics.selectionAsync(); qc.invalidateQueries({ queryKey: ["tasks-mine"] }); },
  });

  const list = (tasks ?? []).filter((t) => tab === "done" ? t.status === "done" : t.status !== "done");
  const counts = {
    open: (tasks ?? []).filter((t) => t.status !== "done").length,
    done: (tasks ?? []).filter((t) => t.status === "done").length,
  };

  if (isLoading) {
    return (
      <SafeAreaView style={center}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["top", "left", "right"]}>
      <FlatList
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xxl }}
        ListHeaderComponent={
          <View>
            <View style={{ paddingTop: space.md, paddingBottom: space.lg }}>
              <Text style={{ fontSize: 28, fontWeight: "700", color: colors.text, letterSpacing: -0.5 }}>Tasks</Text>
              <Text style={{ fontSize: 13, color: colors.muted, marginTop: 4 }}>
                {counts.open} open · {counts.done} done
              </Text>
            </View>
            <View style={{ flexDirection: "row", gap: 4, marginBottom: space.md }}>
              <TabPill active={tab === "open"} label={`Open · ${counts.open}`} onPress={() => setTab("open")} />
              <TabPill active={tab === "done"} label={`Done · ${counts.done}`} onPress={() => setTab("done")} />
            </View>
          </View>
        }
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
        data={list}
        keyExtractor={(t) => t.id}
        renderItem={({ item }) => (
          <Row
            task={item}
            onToggle={() => toggle.mutate({
              id: item.id,
              next: item.status === "done" ? "todo" : "done",
            })}
          />
        )}
        ListEmptyComponent={
          <Text style={{ color: colors.muted, textAlign: "center", marginTop: space.xxl }}>
            {tab === "open" ? "Nothing assigned to you." : "No completed tasks yet."}
          </Text>
        }
      />
    </SafeAreaView>
  );
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
      <Text style={{ fontSize: 12, fontWeight: "600", color: active ? colors.white : colors.muted }}>
        {label}
      </Text>
    </Pressable>
  );
}

function Row({ task, onToggle }: { task: Task; onToggle: () => void }) {
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
        flexDirection: "row",
        gap: space.md,
        alignItems: "flex-start",
      }}
    >
      <Pressable hitSlop={8} onPress={onToggle} style={{ paddingTop: 2 }}>
        {checked ? (
          <CheckCircle size={20} color={colors.primary} fill={colors.primarySoft} />
        ) : (
          <Circle size={20} color={colors.muted} />
        )}
      </Pressable>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={2}
          style={{
            fontSize: 14, fontWeight: "600",
            color: checked ? colors.muted : colors.text,
            textDecorationLine: checked ? "line-through" : "none",
          }}
        >
          {task.title}
        </Text>
        {task.description ? (
          <Text numberOfLines={2} style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
            {task.description}
          </Text>
        ) : null}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6, alignItems: "center" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: PRIORITY_COLOR[task.priority] }} />
            <Text style={{ fontSize: 11, color: colors.muted, fontWeight: "500" }}>{task.priority}</Text>
          </View>
          <Text style={{ fontSize: 11, color: colors.muted }}>· {STATUS_LABEL[task.status]}</Text>
          {task.due_date && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
              <Clock size={11} color={colors.muted} />
              <Text style={{ fontSize: 11, color: colors.muted }}>{task.due_date}</Text>
            </View>
          )}
          {task.tags?.slice(0, 2).map((t) => (
            <View key={t} style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
              <Tag size={10} color={colors.muted} />
              <Text style={{ fontSize: 10, color: colors.muted }}>{t}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const center = {
  flex: 1, backgroundColor: colors.canvas,
  alignItems: "center" as const, justifyContent: "center" as const,
};
