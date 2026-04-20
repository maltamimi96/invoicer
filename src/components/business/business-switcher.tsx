"use client";

import { useState, useTransition } from "react";
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
import type { Business } from "@/types/database";

interface BusinessSwitcherProps {
  business: Business;
  businesses: Business[];
  onClose?: () => void;
}

export function BusinessSwitcher({ business, businesses, onClose }: BusinessSwitcherProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [addOpen, setAddOpen] = useState(false);

  const handleSwitch = (biz: Business) => {
    if (biz.id === business.id) return;
    startTransition(async () => {
      await setActiveBusiness(biz.id);
      router.refresh();
      onClose?.();
    });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              "w-full flex items-center gap-2 px-1 py-1 rounded-lg text-left transition-colors",
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
