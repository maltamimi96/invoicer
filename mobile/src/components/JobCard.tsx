import { Pressable, Text, View } from "react-native";
import { MapPin, Clock, ChevronRight } from "lucide-react-native";
import { useRouter } from "expo-router";
import { StatusPill } from "./StatusPill";
import { colors, cardShadow, radius, space } from "@/lib/theme";
import type { WorkOrderWithCustomer } from "@/lib/types";

/** Clean white job row — mono number + status on top, bold title, customer,
 *  a hairline divider, then address/time meta with a chevron. Reads live
 *  colours at render (no frozen module-scope style consts). */
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
        opacity: pressed ? 0.9 : 1,
        ...cardShadow(1),
      })}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, marginBottom: 8 }}>
        <Text style={{ fontSize: 11, color: colors.subtle, fontFamily: "monospace", letterSpacing: 0.4 }}>
          {job.number}
        </Text>
        <View style={{ flex: 1 }} />
        <StatusPill status={job.status} />
      </View>

      <Text numberOfLines={1} style={{ fontSize: 16.5, fontWeight: "700", color: colors.text, letterSpacing: -0.2 }}>
        {job.title}
      </Text>

      {job.customers?.name && (
        <Text numberOfLines={1} style={{ fontSize: 13, color: colors.muted, marginTop: 3 }}>
          {job.customers.name}{job.customers.company ? ` · ${job.customers.company}` : ""}
        </Text>
      )}

      {(job.property_address || time) && (
        <>
          <View style={{ height: 1, backgroundColor: colors.hairlineSoft, marginTop: space.md, marginBottom: space.sm }} />
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.lg }}>
            {job.property_address ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5, flex: 1 }}>
                <MapPin size={13} color={colors.primary} />
                <Text numberOfLines={1} style={{ fontSize: 12.5, color: colors.muted, flex: 1 }}>
                  {job.property_address}
                </Text>
              </View>
            ) : <View style={{ flex: 1 }} />}
            {time && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <Clock size={13} color={colors.primary} />
                <Text style={{ fontSize: 12.5, fontWeight: "600", color: colors.text }}>{time}</Text>
              </View>
            )}
            <ChevronRight size={18} color={colors.subtle} />
          </View>
        </>
      )}
    </Pressable>
  );
}
