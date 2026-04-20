"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { QuickAddClientModal } from "./quick-add-client-modal";
import type { Customer } from "@/types/database";

interface ClientSelectProps {
  customers: Customer[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  allowNone?: boolean;
  onCustomerCreated?: (customer: Customer) => void;
}

export function ClientSelect({
  customers,
  value,
  onValueChange,
  placeholder = "Select client...",
  allowNone = true,
  onCustomerCreated,
}: ClientSelectProps) {
  const [modalOpen, setModalOpen] = useState(false);

  const items = customers.map((c) => ({
    value: c.id,
    label: c.name,
    sublabel: c.company || c.email || undefined,
    keywords: [c.email, c.phone, c.company, c.address, c.city].filter(Boolean).join(" "),
  }));

  const handleCreated = (customer: Customer) => {
    onCustomerCreated?.(customer);
    onValueChange(customer.id);
  };

  return (
    <>
      <SearchableSelect
        items={items}
        value={value}
        onValueChange={onValueChange}
        placeholder={placeholder}
        searchPlaceholder="Search clients by name, email, phone..."
        emptyText="No clients found."
        allowNone={allowNone}
        noneLabel="No client"
        footer={{
          label: (
            <span className="flex items-center gap-1.5">
              <UserPlus className="w-3.5 h-3.5" />
              Add new client...
            </span>
          ),
          onSelect: () => setModalOpen(true),
        }}
      />

      <QuickAddClientModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        onCreated={handleCreated}
      />
    </>
  );
}
