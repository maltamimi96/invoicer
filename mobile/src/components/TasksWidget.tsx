import { useEffect, useState } from "react";
import { Pressable, Text, View, ActivityIndicator } from "react-native";
import { Columns3, Check, Clock } from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import { colors, radius, space } from "@/lib/theme";

interface MobileTask {
  id:        string;
  title:     string;
  status:    "todo" | "in_progress" | "in_review" | "done";
  priority:  "low" | "normal" | "high" | "urgent";
  due_date:  string | null;
  tags:      string[] | null;
}

const PRIORITY_DOT: Record<MobileTask["priority"], string> = {
  urgent: "#ef4444",
  high:   "#f59e0b",
  normal: "#60a5fa",
  low:    "#9ca3af",
};

/** Mobile tasks widget — shows up to 6 open tasks (todo + in_progress) with
 *  one-tap complete. Mirrors the web TasksWidget. */
export function TasksWidget({ businessId }: { businessId: string }) {
  const [tasks, setTasks] = useState<MobileTask[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = async () => {
    const { data } = await supabase
      .from("tasks")
      .select("id, title, status, priority, due_date, tags")
      .eq("business_id", businessId)
      .neq("status", "done")
      .order("position", { ascending: true })
      .limit(6);
    setTasks((data ?? []) as MobileTask[]);
  };

  useEffect(() => { refresh().catch(() => setTasks([])); }, [businessId]);

  const complete = async (id: string) => {
    setBusyId(id);
    await supabase.from("tasks").update({ status: "done", completed_at: new Date().toISOString() }).eq("id", id);
    await refresh();
    setBusyId(null);
  };

  const todayStr = new Date().toISOString().split("T")[0];

  return (
    <View style={{ backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.hairline, overflow: "hidden" }}>
      <View style={{ flexDirection: "row", alignItems: "center", padding: space.md, borderBottomWidth: tasks && tasks.length > 0 ? 1 : 0, borderBottomColor: colors.hairline, gap: space.sm }}>
        <Columns3 size={14} color={colors.muted} />
        <Text style={{ flex: 1, fontSize: 14, fontWeight: "600", color: colors.text }}>Your todos</Text>
        {tasks && tasks.length > 0 && (
          <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: colors.muted + "33" }}>
            <Text style={{ fontSize: 11, fontWeight: "700", color: colors.text }}>{tasks.length}</Text>
          </View>
        )}
      </View>
      {tasks === null ? (
        <View style={{ padding: space.lg, alignItems: "center" }}>
          <ActivityIndicator color={colors.muted} />
        </View>
      ) : tasks.length === 0 ? (
        <View style={{ padding: space.lg, alignItems: "center", gap: 4 }}>
          <Text style={{ fontSize: 14, fontWeight: "600", color: colors.text }}>Nothing on your list</Text>
          <Text style={{ fontSize: 12, color: colors.muted, textAlign: "center" }}>Open the Tasks tab to add one.</Text>
        </View>
      ) : (
        tasks.map((t) => {
          const overdue = t.due_date && t.due_date < todayStr;
          return (
            <View key={t.id} style={{ flexDirection: "row", alignItems: "flex-start", gap: space.sm, paddingHorizontal: space.md, paddingVertical: space.sm }}>
              <Pressable
                onPress={() => complete(t.id)}
                disabled={busyId === t.id}
                style={{
                  width: 18, height: 18, borderRadius: 9,
                  borderWidth: 2, borderColor: colors.hairline,
                  alignItems: "center", justifyContent: "center", marginTop: 2,
                }}
                hitSlop={8}
              >
                {busyId === t.id && <ActivityIndicator size="small" color="#10b981" />}
              </Pressable>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: PRIORITY_DOT[t.priority] }} />
                  <Text numberOfLines={1} style={{ flex: 1, fontSize: 13, fontWeight: "600", color: colors.text }}>{t.title}</Text>
                </View>
                {(t.due_date || (t.tags && t.tags.length > 0)) && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 }}>
                    {t.due_date && (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                        <Clock size={10} color={overdue ? "#dc2626" : colors.muted} />
                        <Text style={{ fontSize: 10, color: overdue ? "#dc2626" : colors.muted }}>
                          {overdue ? `${t.due_date} (overdue)` : t.due_date}
                        </Text>
                      </View>
                    )}
                    {t.tags?.slice(0, 2).map((tag) => (
                      <View key={tag} style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, backgroundColor: colors.muted + "22" }}>
                        <Text style={{ fontSize: 10, color: colors.muted }}>{tag}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </View>
          );
        })
      )}
    </View>
  );
}
