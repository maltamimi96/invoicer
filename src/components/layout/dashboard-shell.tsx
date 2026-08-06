"use client";

import { Suspense, useState } from "react";
import dynamic from "next/dynamic";
import { AppSidebar } from "./app-sidebar";
import { AppHeader } from "./app-header";
import { AppearanceProvider } from "./appearance-provider";
import { AppLoadingProvider } from "./app-loading";
import { ConfirmProvider } from "@/components/ui/confirm";
import { RouteProgress } from "./route-progress";
import { TabBusinessGuard } from "./tab-business-guard";
import { FocusModeProvider, useFocusMode } from "./focus-mode";
import { AssistantProvider } from "./assistant-context";
// The floating AI assistant starts closed and drags in framer-motion + voice
// capture. Lazy-load it (client-only) so its chunk stays out of every dashboard
// page's first load — the trigger button appears a beat after hydration.
const AgentPanel = dynamic(
  () => import("@/components/agent/agent-panel").then((m) => ({ default: m.AgentPanel })),
  { ssr: false },
);
import type { Business } from "@/types/database";
import type { Role } from "@/lib/permissions";
import { isWorker } from "@/lib/permissions";
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

export function DashboardShell(props: DashboardShellProps) {
  return (
    <AppearanceProvider accentColor={props.business.accent_color} bgPattern={props.business.bg_pattern} sidebarTheme={props.business.sidebar_theme}>
      <AppLoadingProvider>
      <ConfirmProvider>
      <FocusModeProvider>
        <AssistantProvider>
          <ShellBody {...props} />
        </AssistantProvider>
      </FocusModeProvider>
      </ConfirmProvider>
      </AppLoadingProvider>
    </AppearanceProvider>
  );
}

function ShellBody({ business, businesses, user, userRole, features, vocab, children }: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { focus } = useFocusMode();
  const workerView = isWorker(userRole);

  return (
    <>
      <Suspense fallback={null}><RouteProgress /></Suspense>
      {/* MYOB chrome: a full-width accent top bar spans over the sidebar
          column, then a row of sidebar + content beneath it. */}
      <div className="flex h-screen flex-col overflow-hidden bg-background">
        <AppHeader
          user={user}
          business={business}
          onMenuClick={() => setSidebarOpen((o) => !o)}
          workerView={workerView}
          features={features}
          vocab={vocab}
        />

        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* Sidebar — hidden on desktop when Focus mode is on (MYOB-style
              document focus). The wrapper's `md:hidden` collapses the desktop
              aside; on mobile the sidebar is already a hidden drawer. */}
          <div className={focus ? "md:hidden" : "contents"}>
            <AppSidebar
              business={business}
              businesses={businesses}
              userRole={userRole}
              features={features}
              vocab={vocab}
              open={sidebarOpen}
              onClose={() => setSidebarOpen(false)}
            />
          </div>

          {/* Mobile overlay */}
          {sidebarOpen && (
            <div
              className="fixed inset-0 z-20 bg-black/40 md:hidden"
              onClick={() => setSidebarOpen(false)}
            />
          )}

          <main className="app-content min-w-0 flex-1 overflow-auto">
            {/* Connected Hub layout: content fills the main pane (no max-width
                cap), with the prototype's uniform 24px padding.
                Keyed by business.id so switching businesses fully remounts
                the page tree — list components hold their data in local
                useState(initial) and otherwise show the previous biz's
                rows until a hard refresh. */}
            {/* Each tab keeps its own business; see tab-business-guard.tsx. */}
          <TabBusinessGuard businessId={business.id} />
          <div key={business.id} className="w-full p-6">
              {children}
            </div>
          </main>
        </div>
      </div>

      <AgentPanel />
    </>
  );
}
