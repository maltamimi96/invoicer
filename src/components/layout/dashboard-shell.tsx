"use client";

import { Suspense, useState } from "react";
import dynamic from "next/dynamic";
import { AppSidebar } from "./app-sidebar";
import { AppHeader } from "./app-header";
import { AppearanceProvider } from "./appearance-provider";
import { AppLoadingProvider } from "./app-loading";
import { ConfirmProvider } from "@/components/ui/confirm";
import { RouteProgress } from "./route-progress";
// The floating AI assistant starts closed and drags in framer-motion + voice
// capture. Lazy-load it (client-only) so its chunk stays out of every dashboard
// page's first load — the trigger button appears a beat after hydration.
const AgentPanel = dynamic(
  () => import("@/components/agent/agent-panel").then((m) => ({ default: m.AgentPanel })),
  { ssr: false },
);
import type { Business } from "@/types/database";
import type { Role } from "@/lib/permissions";
import type { User } from "@supabase/supabase-js";

interface DashboardShellProps {
  business: Business;
  businesses: Business[];
  user: User;
  userRole: Role;
  /** Feature flags fetched on the server. Drives conditional sidebar items
   *  (e.g. the Quoting Agent tab only shows when enabled). */
  features?: Record<string, boolean>;
  /** Sidebar label overrides keyed by href (industry-preset vocabulary). */
  vocab?: Record<string, string> | null;
  children: React.ReactNode;
}

export function DashboardShell({ business, businesses, user, userRole, features, vocab, children }: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <AppearanceProvider accentColor={business.accent_color} bgPattern={business.bg_pattern} sidebarTheme={business.sidebar_theme}>
      <AppLoadingProvider>
      <ConfirmProvider>
      <Suspense fallback={null}><RouteProgress /></Suspense>
      <div className="flex h-screen overflow-hidden bg-background">
        {/* Sidebar */}
        <AppSidebar
          business={business}
          businesses={businesses}
          userRole={userRole}
          features={features}
          vocab={vocab}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        {/* Mobile overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-20 bg-black/40 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Right column: header + content */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <AppHeader
            user={user}
            business={business}
            onMenuClick={() => setSidebarOpen((o) => !o)}
          />
          <main className="app-content flex-1 overflow-auto">
            {/* Connected Hub layout: content fills the main pane (no max-width
                cap), with the prototype's uniform 24px padding.
                Keyed by business.id so switching businesses fully remounts
                the page tree — list components hold their data in local
                useState(initial) and otherwise show the previous biz's
                rows until a hard refresh. */}
            <div key={business.id} className="w-full p-6">
              {children}
            </div>
          </main>
        </div>
      </div>

      <AgentPanel />
      </ConfirmProvider>
      </AppLoadingProvider>
    </AppearanceProvider>
  );
}
