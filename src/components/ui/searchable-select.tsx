"use client";

import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { cn } from "@/lib/utils";

export interface SearchableSelectItem {
  value: string;
  label: string;
  sublabel?: string;
  keywords?: string;
}

interface SearchableSelectProps {
  items: SearchableSelectItem[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  disabled?: boolean;
  /** Optional row pinned at the bottom — e.g. "Add new..." */
  footer?: { label: React.ReactNode; onSelect: () => void };
  /** When true, renders a "(none)" item at the top that clears the value */
  allowNone?: boolean;
  noneLabel?: string;
}

export function SearchableSelect({
  items,
  value,
  onValueChange,
  placeholder = "Select...",
  searchPlaceholder = "Search...",
  emptyText = "No matches.",
  className,
  disabled,
  footer,
  allowNone = false,
  noneLabel = "— None —",
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const selected = items.find((i) => i.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("w-full justify-between font-normal", !selected && "text-muted-foreground", className)}
        >
          <span className="truncate text-left">
            {selected ? (
              <>
                {selected.label}
                {selected.sublabel && <span className="text-muted-foreground"> · {selected.sublabel}</span>}
              </>
            ) : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command
          filter={(itemValue, search) => {
            const item = items.find((i) => i.value === itemValue);
            if (!item) return 0;
            const haystack = `${item.label} ${item.sublabel ?? ""} ${item.keywords ?? ""}`.toLowerCase();
            return haystack.includes(search.toLowerCase()) ? 1 : 0;
          }}
        >
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {allowNone && (
                <CommandItem
                  value="__none__"
                  onSelect={() => { onValueChange(""); setOpen(false); }}
                >
                  <Check className={cn("mr-2 h-4 w-4", !value ? "opacity-100" : "opacity-0")} />
                  <span className="text-muted-foreground">{noneLabel}</span>
                </CommandItem>
              )}
              {items.map((item) => (
                <CommandItem
                  key={item.value}
                  value={item.value}
                  onSelect={() => { onValueChange(item.value); setOpen(false); }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === item.value ? "opacity-100" : "opacity-0")} />
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="truncate">{item.label}</span>
                    {item.sublabel && <span className="text-xs text-muted-foreground truncate">{item.sublabel}</span>}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
            {footer && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    value="__footer__"
                    onSelect={() => { footer.onSelect(); setOpen(false); }}
                    className="text-primary font-medium"
                  >
                    {footer.label}
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
