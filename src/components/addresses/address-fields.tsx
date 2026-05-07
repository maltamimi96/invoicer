"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AddressAutocomplete, type AddressSuggestion } from "@/components/ui/address-autocomplete";
import { getAddressFormat, type AddressFieldKey } from "@/lib/country-formats";

export interface AddressValues {
  address: string;
  city:    string;
  state:   string;
  postcode:string;
  country: string;
}

interface Props {
  /** Country code or name from the active business — drives the field
   *  layout, labels and placeholders. */
  country: string | null | undefined;
  values:  AddressValues;
  onChange: (next: AddressValues) => void;
  /** Set false to render plain inputs only (no autocomplete on address). */
  autocomplete?: boolean;
  /** Extra className on the wrapper div. */
  className?: string;
  /** Hide the Country field even if the format includes it (for forms where
   *  country is implied by the parent business). */
  hideCountry?: boolean;
}

/** Renders address inputs in the right order and with the right labels for
 *  the active business's country. The street line uses AddressAutocomplete
 *  by default — selecting a result populates city/state/postcode/country. */
export function AddressFields({
  country, values, onChange, autocomplete = true, className, hideCountry,
}: Props) {
  const fmt = getAddressFormat(country);
  const set = <K extends keyof AddressValues>(k: K, v: AddressValues[K]) =>
    onChange({ ...values, [k]: v });

  const handleSuggestion = (s: AddressSuggestion) => {
    onChange({
      address:  s.address  || values.address,
      city:     s.city     || values.city,
      state:    s.state    || values.state,
      postcode: s.postcode || values.postcode,
      country:  s.country  || values.country,
    });
  };

  // Render fields in the order the format dictates. We special-case the
  // street line (autocomplete + full width) and the state line (preset list
  // for known countries like AU).
  const renderField = (key: AddressFieldKey) => {
    if (key === "country" && hideCountry) return null;
    const label       = fmt.labels[key]       ?? key;
    const placeholder = fmt.placeholders[key] ?? "";

    if (key === "address") {
      return (
        <div key={key} className="col-span-2 space-y-1.5">
          <Label>{label}</Label>
          {autocomplete ? (
            <AddressAutocomplete
              value={values.address}
              onChange={(v) => set("address", v)}
              onSelect={handleSuggestion}
              placeholder={placeholder}
            />
          ) : (
            <Input value={values.address} onChange={(e) => set("address", e.target.value)} placeholder={placeholder} />
          )}
        </div>
      );
    }

    if (key === "state" && fmt.states && fmt.states.length > 0) {
      return (
        <div key={key} className="space-y-1.5">
          <Label>{label}</Label>
          <Select value={values.state || undefined} onValueChange={(v) => set("state", v)}>
            <SelectTrigger><SelectValue placeholder={placeholder || "Select"} /></SelectTrigger>
            <SelectContent>
              {fmt.states.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    }

    return (
      <div key={key} className="space-y-1.5">
        <Label>{label}</Label>
        <Input
          value={values[key]}
          onChange={(e) => set(key, e.target.value)}
          placeholder={placeholder}
        />
      </div>
    );
  };

  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 gap-3 ${className ?? ""}`}>
      {fmt.fields.map(renderField)}
    </div>
  );
}
