"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { QuickAddClientModal } from "./quick-add-client-modal";
import type { Customer } from "@/types/database";

interface ClientSelectProps {
  customers: Customer[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  allowNone?: boolean;
}

export function ClientSelect({
  customers: initialCustomers,
  value,
  onValueChange,
  placeholder = "Select client...",
  allowNone = true,
}: ClientSelectProps) {
  const [customers, setCustomers] = useState(initialCustomers);
  const [modalOpen, setModalOpen] = useState(false);

  const handleValueChange = (v: string) => {
    if (v === "__new__") {
      setModalOpen(true);
      return;
    }
    onValueChange(v);
  };

  const handleCreated = (customer: Customer) => {
    setCustomers((prev) => [...prev, customer]);
    onValueChange(customer.id);
  };

  return (
    <>
      <Select value={value} onValueChange={handleValueChange}>
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {allowNone && <SelectItem value="none">No client</SelectItem>}
          {customers.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}{c.company ? ` · ${c.company}` : ""}
            </SelectItem>
          ))}
          <SelectItem value="__new__" className="text-primary font-medium border-t mt-1 pt-1">
            <span className="flex items-center gap-1.5">
              <UserPlus className="w-3.5 h-3.5" />
              Add new client...
            </span>
          </SelectItem>
        </SelectContent>
      </Select>

      <QuickAddClientModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        onCreated={handleCreated}
      />
    </>
  );
}
