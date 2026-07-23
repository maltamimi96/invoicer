import { ActivityIndicator, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { JobsView } from "@/screens/JobsView";
import { WorkerHeader } from "@/components/WorkerHeader";
import { BusinessSwitcher } from "@/components/BusinessSwitcher";
import { useActiveBusiness } from "@/lib/active-business";
import { colors, space } from "@/lib/theme";

/** Worker tab 1 — the jobs assigned to them. */
export default function WorkerJobsTab() {
  const { active, businesses, role, switchTo, loading } = useActiveBusiness();

  if (loading || !active) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["top", "left", "right"]}>
      <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm }}>
        {/* Sign-out lives here — workers have no Profile tab. */}
        <WorkerHeader businessName={active.name} workerName={null} />
        {/* A switcher with one option is clutter on a stripped-back screen.
            Crews who work for two businesses still get it. */}
        {businesses.length > 1 && (
          <BusinessSwitcher active={active} businesses={businesses} role={role} onSwitch={switchTo} />
        )}
      </View>
      <JobsView />
    </SafeAreaView>
  );
}
