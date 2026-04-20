"use client";

import { useEffect, useState } from "react";
import { MapPin, Plus } from "lucide-react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QuickAddSiteModal } from "@/components/sites/quick-add-site-modal";
import { getSitesForAccount } from "@/lib/actions/sites";
import type { Customer, Site } from "@/types/database";

const CUSTOM = "__custom__";

export interface AddressSelectValue {
  /** site id, or null when custom/none */
  site_id: string | null;
  /** resolved address string used for display + storage */
  property_address: string;
}

interface AddressSelectProps {
  customer: Customer | null;
  value: AddressSelectValue;
  onChange: (v: AddressSelectValue) => void;
  /** Optional pre-fetched sites — if omitted, the component fetches them when customer changes. */
  sites?: Site[];
  label?: string;
}

function siteAddress(s: Site): string {
  return [s.address, s.city, s.postcode, s.country].filter(Boolean).join(", ");
}

function customerAddress(c: Customer): string {
  return [c.address, c.city, c.postcode, c.country].filter(Boolean).join(", ");
}

export function AddressSelect({
  customer,
  value,
  onChange,
  sites: sitesProp,
  label = "Address",
}: AddressSelectProps) {
  const [sites, setSites] = useState<Site[]>(sitesProp ?? []);
  const [modalOpen, setModalOpen] = useState(false);

  // Fetch sites when the customer changes (unless caller passes them).
  useEffect(() => {
    if (sitesProp) { setSites(sitesProp); return; }
    if (!customer?.id) { setSites([]); return; }
    let cancelled = false;
    (async () => {
      try {
        const data = await getSitesForAccount(customer.id);
        if (!cancelled) setSites(data);
      } catch {
        if (!cancelled) setSites([]);
      }
    })();
    return () => { cancelled = true; };
  }, [customer?.id, sitesProp]);

  const customerAddr = customer ? customerAddress(customer) : "";

  // Build option list: customer primary (if any) + each site
  const items = [
    ...(customerAddr ? [{
      value: `__customer__${customer!.id}`,
      label: customer!.name + " (primary)",
      sublabel: customerAddr,
      keywords: customerAddr,
    }] : []),
    ...sites.map((s) => ({
      value: s.id,
      label: s.label ?? s.address ?? "Untitled site",
      sublabel: siteAddress(s),
      keywords: [s.label, s.address, s.city, s.postcode].filter(Boolean).join(" "),
    })),
    {
      value: CUSTOM,
      label: "Custom address (one-off)",
      sublabel: "Type any address — won't be saved to the customer",
      keywords: "custom one off",
    },
  ];

  // Decide what's currently selected in the dropdown
  const selectedKey = (() => {
    if (!value.site_id && value.property_address && value.property_address !== customerAddr) return CUSTOM;
    if (!value.site_id && value.property_address === customerAddr && customer) return `__customer__${customer.id}`;
    if (value.site_id) return value.site_id;
    return "";
  })();

  const handleSelect = (key: string) => {
    if (!key) { onChange({ site_id: null, property_address: "" }); return; }
    if (key === CUSTOM) { onChange({ site_id: null, property_address: value.property_address }); return; }
    if (key.startsWith("__customer__")) {
      onChange({ site_id: null, property_address: customerAddr });
      return;
    }
    const s = sites.find((x) => x.id === key);
    if (s) onChange({ site_id: s.id, property_address: siteAddress(s) });
  };

  const isCustom = selectedKey === CUSTOM;

  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {label}</Label>
      <SearchableSelect
        items={items}
        value={selectedKey}
        onValueChange={handleSelect}
        placeholder={customer ? "Select address" : "Select a customer first"}
        searchPlaceholder="Search addresses..."
        disabled={!customer}
        allowNone
        noneLabel="— No address —"
        footer={customer ? {
          label: (
            <span className="flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              Add new property to {customer.name}…
            </span>
          ),
          onSelect: () => setModalOpen(true),
        } : undefined}
      />

      {isCustom && (
        <Input
          placeholder="Type the one-off address"
          value={value.property_address}
          onChange={(e) => onChange({ site_id: null, property_address: e.target.value })}
          autoFocus
        />
      )}

      {customer && (
        <QuickAddSiteModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          accountId={customer.id}
          onCreated={(site) => {
            setSites((prev) => [...prev, site]);
            onChange({ site_id: site.id, property_address: siteAddress(site) });
          }}
        />
      )}
    </div>
  );
}
