"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { SearchableSelect, type SearchableSelectItem } from "@/components/ui/searchable-select";

/**
 * MYOB-style type-ahead select: the shared SearchableSelect (Popover + cmdk),
 * re-skinned to the taller 44px MYOB control geometry. Drop it inside a
 * `MyobField` for the caption label + animated focus underline.
 */
export interface MyobSelectProps {
  items: SearchableSelectItem[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
  footer?: { label: React.ReactNode; onSelect: () => void };
  allowNone?: boolean;
  noneLabel?: string;
}

export function MyobSelect({ className, ...props }: MyobSelectProps) {
  return (
    <SearchableSelect
      {...props}
      className={cn("h-11 rounded-md", className)}
    />
  );
}

export type { SearchableSelectItem };
