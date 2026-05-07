import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { Users2, Repeat, Bot } from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import { colors, radius, space } from "@/lib/theme";

const AGENT_LABEL: Record<string, string> = {
  "daily-digest":      "Daily digest",
  "invoice-reminders": "Invoice reminders",
  "quote-followup":    "Quote follow-up",
  "workorder-complete":"Job complete",
  "recurring-jobs":    "Recurring",
  reminders:           "Reminders",
};

interface Counts {
  membersActive:  number;
  membersPending: number;
  recurringActive: number;
  agents: string[];
}

/** Compact ops snapshot — team / recurring / agents — mirrors web OutlookWidget. */
export function OutlookWidget({ businessId }: { businessId: string }) {
  const [c, setC] = useState<Counts | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data: members }, { data: recurring }, { data: agents }] = await Promise.all([
        supabase.from("business_members").select("status").eq("business_id", businessId),
        supabase.from("recurring_jobs").select("active").eq("business_id", businessId),
        supabase.from("business_agent_installs").select("agent_id, enabled").eq("business_id", businessId).eq("enabled", true),
      ]);
      if (cancelled) return;
      setC({
        membersActive:  (members ?? []).filter((m: { status: string }) => m.status === "active").length,
        membersPending: (members ?? []).filter((m: { status: string }) => m.status === "pending").length,
        recurringActive:(recurring ?? []).filter((r: { active: boolean }) => r.active).length,
        agents:         (agents ?? []).map((a: { agent_id: string }) => AGENT_LABEL[a.agent_id] ?? a.agent_id),
      });
    })().catch(() => { if (!cancelled) setC({ membersActive: 0, membersPending: 0, recurringActive: 0, agents: [] }); });
    return () => { cancelled = true; };
  }, [businessId]);

  return (
    <View style={{ backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.hairline, overflow: "hidden" }}>
      <View style={{ paddingHorizontal: space.md, paddingTop: space.md, paddingBottom: 8 }}>
        <Text style={{ fontSize: 14, fontWeight: "600", color: colors.text }}>Operations</Text>
        <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>Team, recurring jobs, automations</Text>
      </View>
      <Row
        icon={<Users2 size={16} color="#1d4ed8" />}
        label="Team"
        value={c === null ? "Loading…" :
          c.membersActive === 0 ? "No team members yet" :
          `${c.membersActive} active${c.membersPending ? ` · ${c.membersPending} pending` : ""}`}
      />
      <Row
        icon={<Repeat size={16} color="#7c3aed" />}
        label="Recurring jobs"
        value={c === null ? "Loading…" : c.recurringActive === 0 ? "None set up" : `${c.recurringActive} active`}
      />
      <Row
        icon={<Bot size={16} color="#059669" />}
        label="Agents running"
        value={c === null ? "Loading…" :
          c.agents.length === 0 ? "No automations on" :
          c.agents.slice(0, 3).join(" · ") + (c.agents.length > 3 ? ` +${c.agents.length - 3}` : "")}
        last
      />
    </View>
  );
}

function Row({ icon, label, value, last }: { icon: React.ReactNode; label: string; value: string; last?: boolean }) {
  return (
    <View style={{
      flexDirection: "row", alignItems: "center", gap: space.sm,
      paddingHorizontal: space.md, paddingVertical: space.sm + 2,
      borderTopWidth: 1, borderTopColor: colors.hairline,
      ...(last ? {} : {}),
    }}>
      <View style={{ width: 32, height: 32, borderRadius: radius.md, backgroundColor: colors.muted + "22", alignItems: "center", justifyContent: "center" }}>
        {icon}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 13, fontWeight: "600", color: colors.text }}>{label}</Text>
        <Text numberOfLines={1} style={{ fontSize: 11, color: colors.muted }}>{value}</Text>
      </View>
    </View>
  );
}
