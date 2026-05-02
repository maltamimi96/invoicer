import { Pressable, Text, View } from "react-native";
import { MapPin, Clock, ChevronRight } from "lucide-react-native";
import { useRouter } from "expo-router";
import { StatusPill } from "./StatusPill";
import { colors, radius, space } from "@/lib/theme";
import type { WorkOrderWithCustomer } from "@/lib/types";

export function JobCard({ job }: { job: WorkOrderWithCustomer }) {
  const router = useRouter();
  const time = job.start_time ? job.start_time.slice(0, 5) : null;

  return (
    <Pressable
      onPress={() => router.push(`/job/${job.id}`)}
      style={({ pressed }) => ({
        backgroundColor: colors.card,
        borderRadius: radius.xl,
        padding: space.lg,
        marginBottom: space.md,
        borderWidth: 1,
        borderColor: colors.hairline,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, marginBottom: 6 }}>
        <Text style={{ fontSize: 11, color: colors.muted, fontFamily: "monospace" }}>
          {job.number}
        </Text>
        <StatusPill status={job.status} />
      </View>

      <Text numberOfLines={1} style={{ fontSize: 16, fontWeight: "600", color: colors.text, marginBottom: 4 }}>
        {job.title}
      </Text>

      {job.customers?.name && (
        <Text numberOfLines={1} style={{ fontSize: 13, color: colors.muted, marginBottom: 10 }}>
          {job.customers.name}{job.customers.company ? ` · ${job.customers.company}` : ""}
        </Text>
      )}

      <View style={{ flexDirection: "row", alignItems: "center", gap: space.lg }}>
        {job.property_address && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, flex: 1 }}>
            <MapPin size={13} color={colors.muted} />
            <Text numberOfLines={1} style={{ fontSize: 12, color: colors.muted, flex: 1 }}>
              {job.property_address}
            </Text>
          </View>
        )}
        {time && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Clock size={13} color={colors.muted} />
            <Text style={{ fontSize: 12, color: colors.muted }}>{time}</Text>
          </View>
        )}
        <ChevronRight size={18} color={colors.muted} />
      </View>
    </Pressable>
  );
}
