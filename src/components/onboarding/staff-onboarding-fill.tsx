"use client";

/**
 * Fill an onboarding form yourself, on the customer's behalf — for the details
 * you already have and don't need to chase them for.
 *
 * Controlled: the parent owns the picked form + answers, because on the
 * add-client screen the customer doesn't exist yet and the answers can only be
 * saved once they do.
 */

import { useMemo } from "react";
import { ClipboardList, Info } from "@/components/ui/icons";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ClientFields } from "@/components/customers/client-fields";
import {
  staffFillableFields, staffOnlyCustomerFields, type StaffFillProblem,
} from "@/lib/onboarding/staff-fill";
import type { OnboardingField } from "@/types/database";

export interface StaffFillForm {
  id: string;
  name: string;
  schema: OnboardingField[];
}

export interface StaffFillValue {
  formId: string;
  answers: Record<string, unknown>;
}

export function StaffOnboardingFill({
  forms, value, onChange, disabled, showPicker = true, problems = [], allowSecure = false,
}: {
  forms: StaffFillForm[];
  value: StaffFillValue;
  onChange: (next: StaffFillValue) => void;
  disabled?: boolean;
  /** Off where the caller already has a form picker of its own. */
  showPicker?: boolean;
  /** Blocking problems from the last submit attempt, shown against the fields
   *  rather than only in a toast that disappears. */
  problems?: StaffFillProblem[];
  /** Whether credential fields can be filled here — true when the server has
   *  an encryption key. Decided server-side; the browser is only told. */
  allowSecure?: boolean;
}) {
  const picked = forms.find((f) => f.id === value.formId) ?? null;
  const fillable = useMemo(() => (picked ? staffFillableFields(picked.schema, { allowSecure }) : []), [picked, allowSecure]);
  const customerOnly = useMemo(() => (picked ? staffOnlyCustomerFields(picked.schema, { allowSecure }) : []), [picked, allowSecure]);

  if (forms.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No onboarding forms with fields yet — build one under Onboarding first.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {showPicker && (
      <div className="flex items-center gap-2 flex-wrap">
        <Select
          value={value.formId || "none"}
          onValueChange={(v) => onChange({ formId: v === "none" ? "" : v, answers: {} })}
          disabled={disabled}
        >
          <SelectTrigger className="w-full sm:w-[300px]">
            <SelectValue placeholder="Choose a form…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Don&rsquo;t attach one</SelectItem>
            {forms.map((f) => (
              <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      )}

      {picked && (
        <>
          {fillable.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Every field on this form needs the customer (uploads or credentials). Send it to them instead.
            </p>
          ) : (
            <>
              {problems.length > 0 && (
                <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-3">
                  <p className="text-sm font-medium text-destructive">
                    {problems.length === 1 ? "One field needs fixing" : `${problems.length} fields need fixing`}
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {problems.map((p) => (
                      <li key={p.field_id} className="text-xs text-destructive">
                        {p.label} {p.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <ClientFields
                fields={fillable}
                values={value.answers}
                disabled={disabled}
                invalidIds={problems.map((p) => p.field_id)}
                onChange={(id, v) => onChange({ ...value, answers: { ...value.answers, [id]: v } })}
              />
            </>
          )}

          {/* Never let a half-filled form read as complete: name exactly what
              still has to come from the customer. */}
          {customerOnly.length > 0 && (
            <div className="flex gap-2 rounded-xl border border-border bg-muted/40 p-3">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                {customerOnly.length === 1 ? "One field needs" : `${customerOnly.length} fields need`} the
                customer — {customerOnly.map((f) => f.label).join(", ")}. Those can only be submitted through their own link. Send them the form for those.
              </p>
            </div>
          )}
        </>
      )}

      {!picked && showPicker && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ClipboardList className="h-3.5 w-3.5" />
          Attaching a form records it as completed, the same as if they&rsquo;d filled it in.
        </p>
      )}
    </div>
  );
}
