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
import { VocabProvider } from "./vocab-provider";
import type { NavConfig } from "@/lib/nav/config";
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
  /** Resolved label overrides keyed by href (business override over preset). */
  vocab?: Record<string, string> | null;
  /** The business's hide/reorder choices, for the sidebar. */
  navConfig?: NavConfig | null;
  children: React.ReactNode;
}

export function DashboardShell(props: DashboardShellProps) {
  return (
    <AppearanceProvider accentColor={props.business.accent_color} bgPattern={props.business.bg_pattern} sidebarTheme={props.business.sidebar_theme} uiTheme={props.business.ui_theme}>
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

function ShellBody({ business, businesses, user, userRole, features, vocab, navConfig, children }: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { focus } = useFocusMode();
  const workerView = isWorker(userRole);

  return (
    <VocabProvider labels={vocab ?? null}>
      <Suspense fallback={null}><RouteProgress /></Suspense>
      {/* Full bleed. The rounded frame in the reference is the mockup's device
          chrome, not the UI — the app itself fills the window and the only
          framed surface on screen is the content card below. Two soft accent
          glows sit behind everything, as in the design. */}
      <div className="relative flex h-screen flex-col overflow-hidden bg-background">
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-32 -top-44 h-[520px] w-[520px] rounded-full blur-[90px]"
               style={{ background: "var(--glow)" }} />
          <div className="absolute -bottom-56 -right-36 h-[480px] w-[480px] rounded-full blur-[100px]"
               style={{ background: "var(--glow)" }} />
        </div>

        <AppHeader
          user={user}
          business={business}
          businesses={businesses}
          onMenuClick={() => setSidebarOpen((o) => !o)}
          workerView={workerView}
          features={features}
          vocab={vocab}
        />

        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* The rail hides on desktop in Focus mode. `contents` keeps the
              rail a direct flex child in the normal case; `md:hidden` on the
              wrapper collapses the whole thing, and the mobile drawer is
              fixed-position inside AppSidebar so it is unaffected either way. */}
          <div className={focus ? "hidden" : "contents"}>
            <AppSidebar
              business={business}
              businesses={businesses}
              userRole={userRole}
              features={features}
              vocab={vocab}
              navConfig={navConfig}
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

          <main className="app-content relative min-w-0 flex-1 overflow-hidden pb-5 pr-5 max-md:px-3 max-md:pb-3">
            {/* Connected Hub layout: content fills the main pane (no max-width
                cap), with the prototype's uniform 24px padding.
                Keyed by business.id so switching businesses fully remounts
                the page tree — list components hold their data in local
                useState(initial) and otherwise show the previous biz's
                rows until a hard refresh. */}
            {/* Each tab keeps its own business; see tab-business-guard.tsx. */}
          <TabBusinessGuard businessId={business.id} />
          <div
            key={business.id}
            className="h-full w-full overflow-auto rounded-3xl border border-border bg-card p-5 md:p-7"
          >
              {children}
            </div>
          </main>
        </div>
      </div>

      <AgentPanel />
    </VocabProvider>
  );
}
