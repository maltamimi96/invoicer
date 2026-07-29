"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Phone, Mail, MapPin, Plus, X, Trash2, Clock } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  setLeadTags, createLeadTagPreset,
  getLeadNotes, addLeadNote, deleteLeadNote, updateLeadStatus,
} from "@/lib/actions/leads";
import { STAGES } from "./lead-shared";
import type { Lead, LeadStatus, LeadNote, LeadTagPreset } from "@/types/database";

export function LeadDrawer({
  lead,
  open,
  onOpenChange,
  presets: presetsProp,
  onLeadUpdated,
  onPresetsChanged,
}: {
  lead: Lead | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  presets: LeadTagPreset[];
  onLeadUpdated: (id: string, patch: Partial<Lead>) => void;
  onPresetsChanged: (presets: LeadTagPreset[]) => void;
}) {
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [notes, setNotes] = useState<LeadNote[]>([]);
  const [noteDraft, setNoteDraft] = useState("");
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [savingNote, setSavingNote] = useState(false);

  // Reset + load when a lead opens.
  useEffect(() => {
    if (!lead || !open) return;
    setTags(lead.tags ?? []);
    setTagInput("");
    setNoteDraft("");
    setLoadingNotes(true);
    getLeadNotes(lead.id)
      .then(setNotes)
      .catch(() => setNotes([]))
      .finally(() => setLoadingNotes(false));
  }, [lead, open]);

  if (!lead) return null;

  const persistTags = async (next: string[]) => {
    setTags(next);
    try {
      const clean = await setLeadTags(lead.id, next);
      setTags(clean);
      onLeadUpdated(lead.id, { tags: clean });
    } catch {
      toast.error("Couldn't update tags");
    }
  };

  const addTag = (raw: string) => {
    const t = raw.trim();
    if (!t) return;
    if (tags.some((x) => x.toLowerCase() === t.toLowerCase())) { setTagInput(""); return; }
    persistTags([...tags, t]);
    setTagInput("");
  };

  const removeTag = (t: string) => persistTags(tags.filter((x) => x !== t));

  const saveAsPreset = async (label: string) => {
    try {
      const preset = await createLeadTagPreset(label);
      if (!presetsProp.some((p) => p.id === preset.id)) {
        onPresetsChanged([...presetsProp, preset].sort((a, b) => a.label.localeCompare(b.label)));
      }
      toast.success(`Saved "${label}" as a preset`);
    } catch {
      toast.error("Couldn't save preset");
    }
  };

  const setStatus = async (status: LeadStatus) => {
    onLeadUpdated(lead.id, { status });
    try {
      await updateLeadStatus(lead.id, status);
    } catch {
      toast.error("Couldn't update status");
    }
  };

  const submitNote = async () => {
    const body = noteDraft.trim();
    if (!body) return;
    setSavingNote(true);
    try {
      const note = await addLeadNote(lead.id, body);
      setNotes((prev) => [note, ...prev]);
      setNoteDraft("");
    } catch {
      toast.error("Couldn't add note");
    }
    setSavingNote(false);
  };

  const removeNote = async (id: string) => {
    const before = notes;
    setNotes((prev) => prev.filter((n) => n.id !== id));
    try {
      await deleteLeadNote(id);
    } catch {
      toast.error("Couldn't delete note");
      setNotes(before);
    }
  };

  // Presets not already applied, offered as quick-add chips.
  const availablePresets = presetsProp.filter((p) => !tags.some((t) => t.toLowerCase() === p.label.toLowerCase()));
  const canSaveInputAsPreset =
    tagInput.trim().length > 0 && !presetsProp.some((p) => p.label.toLowerCase() === tagInput.trim().toLowerCase());

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto p-0">
        <SheetHeader className="border-b border-border p-5">
          <SheetTitle className="text-lg">{lead.name}</SheetTitle>
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            {lead.phone && <a href={`tel:${lead.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1.5 hover:text-foreground"><Phone className="h-3.5 w-3.5" />{lead.phone}</a>}
            {lead.email && <a href={`mailto:${lead.email}`} className="inline-flex items-center gap-1.5 hover:text-foreground"><Mail className="h-3.5 w-3.5" />{lead.email}</a>}
            {lead.suburb && <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{lead.suburb}</span>}
          </div>
        </SheetHeader>

        <div className="space-y-6 p-5">
          {/* Status */}
          <section>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Pipeline stage</p>
            <div className="flex flex-wrap gap-1.5">
              {STAGES.map((s) => {
                const active = s.status === lead.status;
                return (
                  <button
                    key={s.status}
                    onClick={() => setStatus(s.status)}
                    disabled={active}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold capitalize transition-colors ${
                      active ? "bg-primary text-primary-foreground shadow-sm" : "border border-border bg-card hover:bg-muted"
                    }`}
                  >
                    <span className={`h-2 w-2 rounded-full ${s.dot}`} />
                    {s.label}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Tags */}
          <section>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Tags</p>
            {tags.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {tags.map((t) => (
                  <span key={t} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                    {t}
                    <button onClick={() => removeTag(t)} className="hover:text-primary/70" aria-label={`Remove ${t}`}><X className="h-3 w-3" /></button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(tagInput); } }}
                placeholder="Add a tag…"
                className="h-9"
              />
              <Button size="sm" variant="outline" className="shrink-0" onClick={() => addTag(tagInput)} disabled={!tagInput.trim()}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Add
              </Button>
            </div>
            {canSaveInputAsPreset && (
              <button onClick={() => saveAsPreset(tagInput.trim())} className="mt-1.5 text-xs font-medium text-primary hover:underline">
                + Save &quot;{tagInput.trim()}&quot; as a preset
              </button>
            )}
            {availablePresets.length > 0 && (
              <div className="mt-3">
                <p className="mb-1.5 text-[11px] text-muted-foreground">Presets</p>
                <div className="flex flex-wrap gap-1.5">
                  {availablePresets.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => addTag(p.label)}
                      className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:border-primary/40 hover:text-foreground"
                    >
                      <Plus className="h-3 w-3" /> {p.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Notes log */}
          <section>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Notes</p>
            <div className="space-y-2">
              <Textarea
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                placeholder="Add a note about this lead…"
                rows={3}
              />
              <div className="flex justify-end">
                <Button size="sm" onClick={submitNote} disabled={!noteDraft.trim() || savingNote}>
                  {savingNote ? "Adding…" : "Add note"}
                </Button>
              </div>
            </div>

            <div className="mt-4 space-y-2.5">
              {loadingNotes ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : notes.length === 0 ? (
                <p className="text-sm text-muted-foreground">No notes yet.</p>
              ) : (
                notes.map((n) => (
                  <div key={n.id} className="group rounded-lg border border-border bg-card p-3">
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{n.body}</p>
                    <div className="mt-1.5 flex items-center justify-between">
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {new Date(n.created_at).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })}
                      </span>
                      <button onClick={() => removeNote(n.id)} className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100" aria-label="Delete note">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
