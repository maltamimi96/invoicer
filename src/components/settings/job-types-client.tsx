"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Check, X } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  createJobType,
  updateJobType,
  deleteJobType,
  type JobType,
  type JobTypeInput,
  type ChecklistItem,
} from "@/lib/actions/job-types";

interface Props {
  initial: JobType[];
}

const blank: JobTypeInput = {
  name: "",
  description: "",
  color: "#3b82f6",
  default_duration_minutes: 60,
  default_price: null,
  default_checklist: [],
  is_active: true,
};

export function JobTypesClient({ initial }: Props) {
  const [items, setItems] = useState<JobType[]>(initial);
  const [editing, setEditing] = useState<JobType | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function refreshLocal(next: JobType) {
    setItems((cur) => {
      const i = cur.findIndex((x) => x.id === next.id);
      if (i === -1) return [...cur, next].sort((a, b) => a.name.localeCompare(b.name));
      const copy = [...cur];
      copy[i] = next;
      return copy;
    });
  }

  return (
    <div className="space-y-6 p-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Job types</h1>
          <p className="text-sm text-muted-foreground">
            Reusable templates for jobs — default duration, price, color, and checklist.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="size-4 mr-2" /> New job type
        </Button>
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No job types yet. Create one to speed up scheduling and keep jobs consistent.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((jt) => (
            <Card key={jt.id} className={jt.is_active ? "" : "opacity-60"}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <span
                    className="inline-block size-3 rounded-full"
                    style={{ background: jt.color }}
                    aria-hidden
                  />
                  {jt.name}
                  {!jt.is_active && <span className="text-xs text-muted-foreground">(inactive)</span>}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {jt.description && <p className="text-muted-foreground">{jt.description}</p>}
                <div className="flex items-center gap-4 text-muted-foreground">
                  <span>{jt.default_duration_minutes} min</span>
                  {jt.default_price != null && <span>${jt.default_price}</span>}
                  <span>{jt.default_checklist.length} task{jt.default_checklist.length === 1 ? "" : "s"}</span>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button size="sm" variant="outline" onClick={() => setEditing(jt)}>
                    <Pencil className="size-3.5 mr-1" /> Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setDeleteId(jt.id)}>
                    <Trash2 className="size-3.5 mr-1" /> Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <JobTypeForm
        open={creating}
        onOpenChange={setCreating}
        initial={blank}
        title="New job type"
        pending={pending}
        onSubmit={(values) =>
          start(async () => {
            try {
              const created = await createJobType(values);
              setItems((cur) => [...cur, created].sort((a, b) => a.name.localeCompare(b.name)));
              setCreating(false);
              toast.success("Job type created");
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Failed to create");
            }
          })
        }
      />

      <JobTypeForm
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        initial={editing ?? blank}
        title="Edit job type"
        pending={pending}
        onSubmit={(values) =>
          start(async () => {
            if (!editing) return;
            try {
              const updated = await updateJobType(editing.id, values);
              refreshLocal(updated);
              setEditing(null);
              toast.success("Saved");
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Failed to save");
            }
          })
        }
      />

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this job type?</AlertDialogTitle>
            <AlertDialogDescription>
              Existing jobs created from it stay intact — their type link is just cleared.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                start(async () => {
                  if (!deleteId) return;
                  try {
                    await deleteJobType(deleteId);
                    setItems((cur) => cur.filter((x) => x.id !== deleteId));
                    toast.success("Deleted");
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Failed to delete");
                  } finally {
                    setDeleteId(null);
                  }
                })
              }
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function JobTypeForm(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: JobTypeInput | JobType;
  title: string;
  pending: boolean;
  onSubmit: (values: JobTypeInput) => void;
}) {
  const { open, onOpenChange, initial, title, pending, onSubmit } = props;
  const [values, setValues] = useState<JobTypeInput>(() => normalize(initial));

  // Reset form when dialog opens with a different record
  function normalize(src: JobTypeInput | JobType): JobTypeInput {
    return {
      name: src.name ?? "",
      description: src.description ?? "",
      color: src.color ?? "#3b82f6",
      default_duration_minutes: src.default_duration_minutes ?? 60,
      default_price: src.default_price ?? null,
      default_checklist: src.default_checklist ?? [],
      is_active: src.is_active ?? true,
    };
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) setValues(normalize(initial));
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Defaults are applied when a job is created from this type.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={values.name}
              onChange={(e) => setValues({ ...values, name: e.target.value })}
              placeholder="e.g. Annual boiler service"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="desc">Description</Label>
            <Textarea
              id="desc"
              value={values.description ?? ""}
              onChange={(e) => setValues({ ...values, description: e.target.value })}
              rows={2}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="color">Color</Label>
              <Input
                id="color"
                type="color"
                value={values.color}
                onChange={(e) => setValues({ ...values, color: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="dur">Duration (min)</Label>
              <Input
                id="dur"
                type="number"
                min={1}
                value={values.default_duration_minutes}
                onChange={(e) =>
                  setValues({ ...values, default_duration_minutes: Number(e.target.value) || 60 })
                }
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="price">Default price</Label>
              <Input
                id="price"
                type="number"
                step="0.01"
                min={0}
                value={values.default_price ?? ""}
                onChange={(e) =>
                  setValues({
                    ...values,
                    default_price: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </div>
          </div>

          <ChecklistEditor
            items={values.default_checklist}
            onChange={(default_checklist) => setValues({ ...values, default_checklist })}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={() => onSubmit(values)} disabled={pending || !values.name.trim()}>
            {pending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ChecklistEditor({
  items,
  onChange,
}: {
  items: ChecklistItem[];
  onChange: (next: ChecklistItem[]) => void;
}) {
  const [draft, setDraft] = useState("");

  return (
    <div className="space-y-2">
      <Label>Default checklist</Label>
      <div className="space-y-1">
        {items.map((it, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="flex-1 text-sm">{it.text}</span>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => {
                const next = [...items];
                next[i] = { ...it, required: !it.required };
                onChange(next);
              }}
              title={it.required ? "Required" : "Optional"}
            >
              {it.required ? <Check className="size-4" /> : <X className="size-4 opacity-50" />}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => onChange(items.filter((_, j) => j !== i))}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          placeholder="Add a task and press Enter"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && draft.trim()) {
              e.preventDefault();
              onChange([...items, { text: draft.trim() }]);
              setDraft("");
            }
          }}
        />
        <Button
          variant="outline"
          onClick={() => {
            if (draft.trim()) {
              onChange([...items, { text: draft.trim() }]);
              setDraft("");
            }
          }}
        >
          Add
        </Button>
      </div>
    </div>
  );
}
