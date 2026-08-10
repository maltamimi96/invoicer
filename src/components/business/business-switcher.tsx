"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { useTrackedRefresh } from "@/components/layout/use-mutation";
import { useRouter } from "next/navigation";
import { ChevronsUpDown, Check, Plus, Building2 } from "@/components/ui/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { setActiveBusiness } from "@/lib/actions/business";
import { AddBusinessModal } from "./add-business-modal";
import { useAppLoading } from "@/components/layout/app-loading";
import { rememberTabBusiness } from "@/components/layout/tab-business-guard";
import type { Business } from "@/types/database";

interface BusinessSwitcherProps {
  business: Business;
  businesses: Business[];
  onClose?: () => void;
}

export function BusinessSwitcher({ business, businesses, onClose }: BusinessSwitcherProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // null: this component owns the overlay — it has its own per-business label
  // and a stall timeout. useTrackedRefresh is here purely to make the refresh
  // run inside a transition, which it did not before.
  const { refresh } = useTrackedRefresh(null);
  const [addOpen, setAddOpen] = useState(false);
  const { setBusy } = useAppLoading();
  const pendingSwitch = useRef(false);

  const handleSwitch = (biz: Business) => {
    if (biz.id === business.id) return;
    setBusy(`Switching to ${biz.name}…`);
    // Claim the tab BEFORE the cookie flips, or the guard sees a hint that
    // doesn't match this tab's remembered business and switches straight back.
    rememberTabBusiness(biz.id);
    pendingSwitch.current = true;
    onClose?.();
    // setActiveBusiness flips the cookie, then refresh() refetches the
    // whole tree for the new business. Both run inside the transition, so
    // `isPending` stays true until the refreshed dashboard has committed.
    startTransition(async () => {
      await setActiveBusiness(biz.id);
      refresh();
    });
    // Safety net: never let the overlay get stuck if the refresh stalls.
    window.setTimeout(() => {
      if (pendingSwitch.current) { pendingSwitch.current = false; setBusy(null); }
    }, 15000);
  };

  // Hold the full-screen loader until the switch transition fully resolves
  // (new dashboard data fetched + committed), then clear it.
  useEffect(() => {
    if (!isPending && pendingSwitch.current) {
      pendingSwitch.current = false;
      setBusy(null);
    }
  }, [isPending, setBusy]);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              "w-full flex items-center gap-2 px-1 py-1 rounded-md text-left transition-colors",
              "hover:bg-sidebar-accent focus:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-primary",
              isPending && "opacity-60 pointer-events-none"
            )}
          >
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm leading-tight truncate text-sidebar-foreground">
                {business.name}
              </p>
              {(business.email || business.website) && (
                <p className="text-xs text-sidebar-foreground/40 truncate mt-0.5 leading-tight">
                  {business.email ?? business.website}
                </p>
              )}
            </div>
            <ChevronsUpDown className="w-3.5 h-3.5 flex-shrink-0 text-sidebar-foreground/40" />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          side="bottom"
          align="start"
          className="w-56"
          sideOffset={4}
        >
          <DropdownMenuLabel className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Your businesses
          </DropdownMenuLabel>
          <DropdownMenuSeparator />

          {businesses.map((biz) => (
            <DropdownMenuItem
              key={biz.id}
              onClick={() => handleSwitch(biz)}
              className="cursor-pointer"
            >
              <Building2 className="w-4 h-4 mr-2 shrink-0 text-muted-foreground" />
              <span className="flex-1 truncate">{biz.name}</span>
              {biz.id === business.id && (
                <Check className="w-4 h-4 ml-2 shrink-0 text-primary" />
              )}
            </DropdownMenuItem>
          ))}

          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setAddOpen(true)}
            className="cursor-pointer text-primary focus:text-primary"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add new business
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AddBusinessModal open={addOpen} onOpenChange={setAddOpen} />
    </>
  );
}
