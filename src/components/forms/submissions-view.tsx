"use client";

/**
 * Reading what people sent you.
 *
 * This used to live inside the form BUILDER, so checking replies meant opening
 * the editor for the live form you were collecting them with — the routine job
 * guarded by the dangerous one. It's its own tab now, across every form, with
 * a filter when you want one form's replies.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useMutation } from "@/components/layout/use-mutation";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trash2, Search, X, ListChecks } from "@/components/ui/icons";
import { cn, formatDate } from "@/lib/utils";
import { deleteFormSubmission, type SubmissionWithForm } from "@/lib/actions/forms";
import type { OnboardingField, PublicForm } from "@/types/database";

const LAYOUT_ONLY = ["heading", "divider", "instructions"];

/** Answers are keyed by field id, so a label needs the form's schema. */
function answerRows(schema: OnboardingField[] | undefined, answers: Record<string, unknown> | null) {
  return (schema ?? [])
    .filter((f) => !LAYOUT_ONLY.includes(f.type))
    .map((f) => ({ id: f.id, label: f.label, value: fmtAnswer(answers?.[f.id]) }));
}

function fmtAnswer(v: unknown): string {
  if (v == null || v === "") return "—";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "object" && (v as { name?: string }).name) return `📎 ${(v as { name: string }).name}`;
  if (v === true) return "Yes";
  if (v === false) return "No";
  return String(v);
}

interface Props {
  submissions: SubmissionWithForm[];
  forms: Pick<PublicForm, "id" | "name">[];
  /** Pre-selected form filter, from ?form= — how the builder deep-links here. */
  activeFormId?: string;
}

export function SubmissionsView({ submissions, forms, activeFormId }: Props) {
  const router = useRouter();
  const { run, pending } = useMutation();
  const [formFilter, setFormFilter] = useState(activeFormId ?? "");
  const [search, setSearch] = useState("");

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return submissions.filter((s) => {
      if (formFilter && s.form_id !== formFilter) return false;
      if (!q) return true;
      // Search the answers themselves — you remember what someone wrote, not
      // which field they wrote it in.
      const hay = [
        s.public_forms?.name,
        s.leads?.name,
        ...Object.values(s.answers ?? {}).map((v) => fmtAnswer(v)),
      ].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [submissions, formFilter, search]);

  function handleDelete(id: string) {
    if (!confirm("Delete this submission? This can't be undone.")) return;
    void run(() => deleteFormSubmission(id), {
      busy: "Deleting…", success: "Submission deleted", error: "Couldn't delete",
    });
  }

  function setFilter(id: string) {
    setFormFilter(id);
    // Keep the URL honest so a refresh or a shared link lands in the same place.
    const url = id ? `/forms?tab=submissions&form=${id}` : "/forms?tab=submissions";
    router.replace(url, { scroll: false });
  }

  if (submissions.length === 0) {
    return (
      <Card>
        <CardContent className="py-14 text-center">
          <ListChecks className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
          <p className="font-medium">No submissions yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            Share a form&apos;s link or embed it on your site — replies land here.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search answers, names…"
            className="pl-9 pr-9"
            aria-label="Search submissions"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {forms.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setFilter("")}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                !formFilter ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80",
              )}
            >
              All forms
            </button>
            {forms.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium transition-colors max-w-[14rem] truncate",
                  formFilter === f.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80",
                )}
              >
                {f.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {visible.length} of {submissions.length} {submissions.length === 1 ? "submission" : "submissions"}
      </p>

      {visible.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          Nothing matches that.
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {visible.map((s) => {
            const rows = answerRows(s.public_forms?.schema, s.answers as Record<string, unknown> | null);
            return (
              <Card key={s.id}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                      {s.public_forms?.name && (
                        <Badge variant="secondary" className="text-[10px]">{s.public_forms.name}</Badge>
                      )}
                      <span className="text-xs text-muted-foreground">{formatDate(s.created_at)}</span>
                      {s.leads?.name && (
                        <span className="text-xs text-muted-foreground">
                          · lead:{" "}
                          <Link href={`/leads/${s.lead_id}`} className="underline hover:text-foreground">
                            {s.leads.name}
                          </Link>
                        </span>
                      )}
                    </div>
                    <Button
                      variant="ghost" size="sm" disabled={pending}
                      onClick={() => handleDelete(s.id)}
                      className="text-muted-foreground hover:text-destructive shrink-0"
                      aria-label="Delete submission"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>

                  {rows.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      The form&apos;s fields have changed since this was sent, so there are no
                      labels to show it against.
                    </p>
                  ) : (
                    <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
                      {rows.map((r) => (
                        <div key={r.id} className="min-w-0">
                          <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{r.label}</dt>
                          <dd className="text-sm break-words">{r.value}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
