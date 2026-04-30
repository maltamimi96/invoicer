import { Text, View } from "react-native";
import { STATUS_PILL } from "@/lib/theme";
import type { WorkOrderStatus } from "@/lib/types";

export function StatusPill({ status }: { status: WorkOrderStatus }) {
  const s = STATUS_PILL[status] ?? STATUS_PILL.draft;
  return (
    <View
      style={{
        backgroundColor: s.bg,
        paddingHorizontal: 10,
        paddingVertical: 3,
        borderRadius: 999,
        alignSelf: "flex-start",
      }}
    >
      <Text style={{ color: s.fg, fontSize: 11, fontWeight: "700" }}>{s.label}</Text>
    </View>
  );
}
