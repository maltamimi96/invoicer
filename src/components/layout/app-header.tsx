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
import { BusinessSwitcher } from "@/components/business/business-switcher";
import { ThemeSwatches } from "./theme-swatches";
import { useAssistant } from "./assistant-context";
import type { Business } from "@/types/database";
import type { User as SupabaseUser } from "@supabase/supabase-js";

interface AppHeaderProps {
  business: Business;
  /** For the switcher, which now lives up here rather than in the rail. */
  businesses: Business[];
  user: SupabaseUser;
  onMenuClick: () => void;
  workerView: boolean;
  features?: Record<string, boolean>;
  vocab?: Record<string, string> | null;
}

/**
 * Top bar, following the reference dashboard: the mark alone on the left,
 * aligned over the rail beneath it, and everything else gathered on the right
 * — search, which business you are in, theme, assistant, notifications, you.
 *
 * No bottom border and no accent band: in the reference the bar is simply the
 * top of the canvas, and the only framed thing on screen is the content card.
 */
export function AppHeader({ user, business, businesses, onMenuClick, workerView, features, vocab }: AppHeaderProps) {
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

  const iconBtn = "inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-border bg-card text-muted-foreground transition-colors hover:text-foreground hover:border-border-strong";

  return (
    <header
      className="flex h-[72px] shrink-0 items-center bg-background text-foreground"
      >
      {/* Brand, far left and aligned over the rail below it. No divider — in
          the reference the mark simply sits at the top-left of the canvas. */}
      <div className="hidden w-20 shrink-0 items-center justify-center md:flex">
        <KireiMark className="h-7 w-auto" />
      </div>

      {/* Mobile: menu + mark */}
      <div className="flex items-center gap-2 pl-4 md:hidden">
        <button onClick={onMenuClick} className={iconBtn} aria-label="Menu">
          <Menu className="h-5 w-5" />
        </button>
        <KireiMark className="h-6 w-auto" />
      </div>

      {/* Everything else is pushed right: the reference keeps the whole
          top-right cluster together and leaves the left side to the brand. */}
      <div className="ml-auto flex items-center gap-2 pr-4 md:gap-3 md:pr-7">
        <div className="hidden w-[260px] lg:block xl:w-[320px]">
          <GlobalSearch workerView={workerView} features={features} vocab={vocab} />
        </div>

        {/* Which business you are in belongs up here, next to who you are —
            not buried at the bottom of an icon rail. */}
        <div className="hidden sm:block">
          <BusinessSwitcher business={business} businesses={businesses} />
        </div>

        <ThemeSwatches />

        <button className={iconBtn} onClick={toggleAssistant} aria-label="AI assistant" title="Ask Kirei">
          <Bot className="h-[18px] w-[18px]" />
        </button>
        <div className="[&_button]:text-foreground">
          <BriefingBell />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="inline-flex items-center justify-center rounded-full transition hover:opacity-90" aria-label="Account">
              <Avatar className="h-11 w-11">
                <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">{initials}</AvatarFallback>
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
