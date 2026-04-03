"use client";

import { useState } from "react";
import { AppSidebar } from "./app-sidebar";
import { AppHeader } from "./app-header";
import { AppearanceProvider } from "./appearance-provider";
import { AgentPanel } from "@/components/agent/agent-panel";
import type { Business } from "@/types/database";
import type { Role } from "@/lib/permissions";
import type { User } from "@supabase/supabase-js";

interface DashboardShellProps {
  business: Business;
  businesses: Business[];
  user: User;
  userRole: Role;
  children: React.ReactNode;
}

export function DashboardShell({ business, businesses, user, userRole, children }: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <AppearanceProvider accentColor={business.accent_color} bgPattern={business.bg_pattern} sidebarTheme={business.sidebar_theme}>
      <div className="flex h-screen overflow-hidden bg-background">
        {/* Sidebar */}
        <AppSidebar
          business={business}
          businesses={businesses}
          userRole={userRole}
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
          <main className="app-content flex-1 overflow-auto p-4 md:p-6 lg:p-8">
            {children}
          </main>
        </div>
      </div>

      <AgentPanel />
    </AppearanceProvider>
  );
}
