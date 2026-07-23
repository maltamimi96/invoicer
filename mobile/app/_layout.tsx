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
import { isWorker } from "@/lib/permissions";

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

  // ONE deterministic gate that decides where a user belongs. The previous
  // version split this across two effects — one that only fired on the auth
  // screen, one for "mismatch" — and they could both run and fight each other,
  // so the outcome depended on render timing. That flip-flopped: sometimes a
  // worker leaked into the admin group, sometimes an admin got stuck in the
  // worker group. This runs the same rule every time, from any starting route.
  useEffect(() => {
    if (!loaded) return;
    const top = segments[0];

    // Not signed in → auth (and don't bother routing while there).
    if (!session) {
      if (top !== "(auth)") router.replace("/(auth)/login");
      return;
    }
    // Signed in but role not yet confirmed → wait. Never guess the group from
    // the default role; guessing is exactly what flashed the wrong UI.
    if (roleLoading) return;

    // job/[id] is a shared stack route both roles legitimately open — leave it.
    if (top === "job") return;

    if (isWorker(role)) {
      // A worker belongs ONLY in the (worker) group. Everything else — the admin
      // tabs, settings, invoices, a stale (auth) — bounces back.
      if (top !== "(worker)") router.replace("/(worker)");
    } else {
      // Admin/owner/editor/viewer: rescue them only OUT of the worker group or
      // the auth screen. Do NOT touch other admin routes (settings, invoices,
      // customers…) — those are legitimate places for them to be.
      if (top === "(worker)" || top === "(auth)") router.replace("/(tabs)");
    }
  }, [loaded, session, roleLoading, role, segments, router]);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.canvas }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style={resolved === "dark" ? "light" : "dark"} />
          {/* NOT keyed on the theme: re-keying the ROOT navigator resets which
              group you're in, which dumped workers back into the admin (tabs)
              group. Theme repaint is handled one level down — each group's Tabs
              navigator is keyed on `resolved` — so screens re-read the mutated
              palette without ever disturbing worker/admin routing. */}
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
