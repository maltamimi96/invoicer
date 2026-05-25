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
    if (session  &&  inAuth) router.replace("/(tabs)");
  }, [loaded, session, segments, router]);

  // Worker hard-isolation: bounce a worker off any admin route (invoices,
  // leads, customers, quotes, etc.) — covers deep links + programmatic nav
  // that the hidden tabs wouldn't stop. Wait until role is resolved so we
  // don't bounce a still-loading admin.
  useEffect(() => {
    if (!loaded || !session || roleLoading) return;
    if (isWorker(role) && isRouteBlockedForWorker(segments as string[])) {
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
            <Stack.Screen name="job/[id]" options={{ presentation: "card", animation: "slide_from_right" }} />
          </Stack>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
