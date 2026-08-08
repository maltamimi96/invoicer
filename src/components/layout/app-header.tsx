"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { KireiWordmark, KireiMark } from "@/components/brand/kirei-logo";
import { LogOut, Settings, User, Menu, Bot } from "@/components/ui/icons";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { BriefingBell } from "@/components/briefing/briefing-bell";
import { GlobalSearch } from "./global-search";
import { ThemeSwatches } from "./theme-swatches";
import { useAssistant } from "./assistant-context";
import type { Business } from "@/types/database";
import type { User as SupabaseUser } from "@supabase/supabase-js";

interface AppHeaderProps {
  business: Business;
  user: SupabaseUser;
  onMenuClick: () => void;
  workerView: boolean;
  features?: Record<string, boolean>;
  vocab?: Record<string, string> | null;
}

/**
 * MYOB-style top bar: a full-width accent band that spans over the sidebar
 * column. Left = brand (over the sidebar width), a divider, then a big search
 * pill, then right-aligned action icons. The accent follows the chosen colour
 * (`--primary` via the accent picker), so "choose a colour" still works.
 */
export function AppHeader({ user, onMenuClick, workerView, features, vocab }: AppHeaderProps) {
  const router = useRouter();
  const { toggle: toggleAssistant } = useAssistant();
  const supabase = createClient();

  const initials = (user.user_metadata?.full_name as string)
    ?.split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) ?? user.email?.[0].toUpperCase() ?? "U";

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast.success("Signed out");
    router.push("/auth/login");
    router.refresh();
  };

  const iconBtn = "inline-flex h-9 w-9 items-center justify-center rounded-md text-nav-foreground/90 transition-colors hover:bg-white/15";

  return (
    <header
      className="flex h-[72px] shrink-0 items-center border-b border-border bg-background text-foreground"
      style={{ backgroundImage: "linear-gradient(180deg, var(--accent-soft) 0%, transparent 100%)" }}
    >
      {/* Brand segment — over the sidebar column (desktop). The lockup carries
          the name, so there's no wordmark text beside it. */}
      <div className="hidden md:flex h-11 shrink-0 items-center border-r border-border pl-6 pr-4">
        <KireiWordmark className="h-6 w-auto" />
      </div>

      {/* Mobile: menu + mark (the full lockup won't fit beside the search) */}
      <div className="flex items-center gap-2 pl-3 md:hidden">
        <button onClick={onMenuClick} className={iconBtn} aria-label="Menu">
          <Menu className="h-5 w-5" />
        </button>
        <KireiMark className="h-6 w-auto" accentClassName="fill-[#F05A42]" />
      </div>

      {/* Search */}
      <div className="flex flex-1 items-center px-3 md:px-6">
        <div className="w-full max-w-lg">
          <GlobalSearch workerView={workerView} features={features} vocab={vocab} />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 pr-2 md:pr-6">
        <button className={iconBtn} onClick={toggleAssistant} aria-label="AI assistant" title="Ask Kirei">
          <Bot className="h-[18px] w-[18px]" />
        </button>
        <div className="[&_button]:text-nav-foreground [&_button:hover]:bg-white/15">
          <BriefingBell />
        </div>
        <ThemeSwatches className="mx-1.5" />
        <Link href="/settings" className={iconBtn} aria-label="Settings">
          <Settings className="h-[18px] w-[18px]" />
        </Link>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="ml-1 inline-flex items-center justify-center rounded-full ring-1 ring-white/30 transition hover:ring-white/60" aria-label="Account">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-white/20 text-xs font-semibold text-nav-foreground">{initials}</AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <div className="px-2 py-1.5">
              <p className="truncate text-sm font-medium">{user.user_metadata?.full_name ?? "User"}</p>
              <p className="truncate text-xs text-muted-foreground">{user.email}</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings" className="flex cursor-pointer items-center gap-2">
                <Settings className="h-4 w-4" /> Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/settings/profile" className="flex cursor-pointer items-center gap-2">
                <User className="h-4 w-4" /> Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer text-destructive focus:text-destructive">
              <LogOut className="mr-2 h-4 w-4" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
