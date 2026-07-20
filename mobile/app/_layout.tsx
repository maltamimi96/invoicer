import { useEffect, useState } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { colors } from "@/lib/theme";
import { ThemeProvider, useThemeMode } from "@/lib/theme-provider";
import { useActiveBusiness } from "@/lib/active-business";
import { isWorker, isRouteBlockedForWorker } from "@/lib/permissions";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

export default function RootLayout() {
  return (
    <ThemeProvider>
      <Inner />
    </ThemeProvider>
  );
}

function Inner() {
  const { resolved } = useThemeMode();
  const [session, setSession] = useState<Session | null>(null);
  const [loaded,  setLoaded]  = useState(false);
  const router   = useRouter();
  const segments = useSegments();
  const { role, loading: roleLoading } = useActiveBusiness();

  useEffect(() => {
    // Idempotent: if a member_profile exists for this email in any business
    // the worker is in, point its user_id at the auth user. Lets a worker who
    // ONLY uses Kirei (the mobile app) (never the web) still light up assigned jobs.
    const linkProfile = () => {
      supabase.rpc("link_my_member_profile").then(() => undefined, () => undefined);
    };

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoaded(true);
      if (data.session) linkProfile();
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s) linkProfile();
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const inAuth = segments[0] === "(auth)";
    if (!session && !inAuth) router.replace("/(auth)/login");
    // Land signed-in users on the group their role belongs to. Until the role
    // resolves, hold at the auth screen rather than flashing the admin UI at a
    // worker — the swap is jarring and briefly shows them things they can't use.
    if (session && inAuth && !roleLoading) {
      router.replace(isWorker(role) ? "/(worker)" : "/(tabs)");
    }
  }, [loaded, session, segments, router, roleLoading, role]);

  // Role/group mismatch. Two genuinely separate navigators now exist —
  // (worker) has two screens, (tabs) has the full admin app — so this is not
  // hiding buttons, it is making sure each role is inside its own tree.
  //
  // Still needed for: a role that changes while the app is open, a restored
  // deep link into the wrong group, and any legacy /(tabs) link. The
  // isRouteBlockedForWorker list keeps covering the stack routes that sit
  // outside both groups (invoices, customers, settings...).
  useEffect(() => {
    if (!loaded || !session || roleLoading) return;
    const worker = isWorker(role);
    const top = segments[0];

    if (worker && (top === "(tabs)" || isRouteBlockedForWorker(segments as string[]))) {
      router.replace("/(worker)");
      return;
    }
    // An admin who somehow lands in the worker group gets their own app back.
    if (!worker && top === "(worker)") {
      router.replace("/(tabs)");
    }
  }, [loaded, session, roleLoading, role, segments, router]);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.canvas }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style={resolved === "dark" ? "light" : "dark"} />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }}>
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="(worker)" />
            <Stack.Screen name="job/[id]" options={{ presentation: "card", animation: "slide_from_right" }} />
          </Stack>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
