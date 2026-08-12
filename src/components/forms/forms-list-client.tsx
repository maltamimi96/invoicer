"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTrackedRefresh } from "@/components/layout/use-mutation";
import Link from "next/link";
import { toast } from "sonner";
import { Plus, ListChecks, Trash2, Copy, Loader2, Eye, ExternalLink, CodeIcon } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { setFormBuilderEnabled, createPublicForm, deletePublicForm } from "@/lib/actions/forms";
import { cn, formatDate } from "@/lib/utils";
import { embedSnippet } from "@/lib/forms/embed";
import { SubmissionsView } from "@/components/forms/submissions-view";
import type { PublicForm } from "@/types/database";
import type { SubmissionWithForm } from "@/lib/actions/forms";

const STATUS_TONES: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  published: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  archived: "bg-muted text-muted-foreground line-through",
};

interface Props {
  enabled: boolean;
  forms: (PublicForm & { submission_count: number })[];
  baseUrl: string;
  submissions?: SubmissionWithForm[];
  /** Which tab the URL asked for. */
  tab?: "forms" | "submissions";
  /** ?form= — the builder deep-links here filtered to one form. */
  activeFormId?: string;
}

export function FormsListClient({
  enabled, forms, baseUrl, submissions = [], tab = "forms", activeFormId,
}: Props) {
  const router = useRouter();
  // The scrim has to outlast the refresh: a local `finally { setBusy(false) }`
  // fires when refresh() is CALLED, not when the server output arrives.
  const { refresh } = useTrackedRefresh();
  const [busy, setBusy] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [embedFor, setEmbedFor] = useState<PublicForm | null>(null);

  if (!enabled) {
    return (
      <div className="max-w-xl mx-auto py-12">
        <Card>
          <CardContent className="p-8 text-center space-y-4">
            <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 flex items-center justify-center text-white mx-auto">
              <ListChecks className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Form Builder</h1>
              <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto">
                Build public lead-capture forms, share them with a link or embed them on your
                website. Every submission is captured and can auto-create a lead in your pipeline.
              </p>
            </div>
            <Button className="mt-2" disabled={busy}
              onClick={async () => {
                setBusy(true);
                try { await setFormBuilderEnabled(true); toast.success("Form Builder enabled"); refresh(); }
                catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't enable"); }
                finally { setBusy(false); }
              }}>
              {busy ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null} Enable Form Builder
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const create = async () => {
    if (!name.trim()) return toast.error("Give the form a name");
    setBusy(true);
    try {
      const form = await createPublicForm({ name: name.trim(), description: description.trim() || null });
      toast.success("Form created — now add your fields");
      setNewOpen(false); setName(""); setDescription("");
      router.push(`/forms/${form.id}`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't create"); }
    finally { setBusy(false); }
  };

  // The tab count comes from the forms list, not the loaded page of
  // submissions — the Forms tab must show the true total even when the
  // Submissions tab hasn't been opened and `submissions` is empty.
  const totalSubmissions = forms.reduce((n, f) => n + (f.submission_count ?? 0), 0);

  const publicUrl = (slug: string) => `${baseUrl}/f/${slug}`;
  const copy = (text: string, msg: string) => navigator.clipboard.writeText(text).then(() => toast.success(msg), () => toast.error("Copy failed"));

  return (
    <div>
      <PageHeader
        title="Forms"
        subtitle="Public lead-capture forms you can share or embed"
        actions={
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Switch checked onCheckedChange={async (v) => {
                if (v) return;
                try { await setFormBuilderEnabled(false); toast.success("Form Builder disabled"); refresh(); }
                catch { toast.error("Couldn't disable"); }
              }} />
              Enabled
            </div>
            <Button onClick={() => setNewOpen(true)}><Plus className="w-4 h-4 mr-1.5" /> New form</Button>
          </div>
        }
      />

      {/* Reading replies and editing the form are different jobs. Submissions
          used to sit INSIDE the builder, so checking what someone sent meant
          opening the editor for a live form. Two tabs, one nav entry. */}
      <div className="mb-5 flex gap-2 border-b border-border">
        {([
          { id: "forms", label: `Forms (${forms.length})`, href: "/forms" },
          { id: "submissions", label: `Submissions (${totalSubmissions})`, href: "/forms?tab=submissions" },
        ] as const).map((t) => (
          <Link
            key={t.id}
            href={t.href}
            className={cn(
              "-mb-px border-b-2 px-1 pb-2 text-sm font-medium transition-colors",
              tab === t.id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "submissions" ? (
        <SubmissionsView
          submissions={submissions}
          forms={forms.map((f) => ({ id: f.id, name: f.name }))}
          activeFormId={activeFormId}
        />
      ) : forms.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <ListChecks className="w-8 h-8 mx-auto mb-3 opacity-40" />
          <p className="font-medium">No forms yet</p>
          <p className="text-sm mt-1">Create a lead-capture form, then share the link or embed it on your site.</p>
        </CardContent></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {forms.map((f) => (
            <Card key={f.id} className="hover:border-primary/40 transition-colors">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/forms/${f.id}`} className="font-semibold hover:underline break-words">{f.name}</Link>
                  <Badge variant="secondary" className={STATUS_TONES[f.status] ?? ""}>{f.status}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {f.schema.length} field{f.schema.length === 1 ? "" : "s"} · {f.submission_count} submission{f.submission_count === 1 ? "" : "s"}
                </p>
                <code className="block text-[11px] text-muted-foreground truncate">/f/{f.slug}</code>
                <div className="flex items-center gap-1.5 pt-1 flex-wrap">
                  <Button size="sm" variant="outline" className="h-8" asChild>
                    <Link href={`/forms/${f.id}`}>Edit</Link>
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8" onClick={() => copy(publicUrl(f.slug), "Public link copied")} disabled={f.status !== "published"}>
                    <Copy className="w-3.5 h-3.5 mr-1" /> Link
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8" onClick={() => setEmbedFor(f)} disabled={f.status !== "published"}>
                    <CodeIcon className="w-3.5 h-3.5 mr-1" /> Embed
                  </Button>
                  <a href={publicUrl(f.slug)} target="_blank" rel="noopener noreferrer" className="ml-auto text-muted-foreground hover:text-foreground p-1.5" title="Open public form">
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <button className="text-muted-foreground hover:text-destructive p-1.5"
                    onClick={async () => {
                      if (!confirm(`Delete "${f.name}" and all its submissions?`)) return;
                      try { await deletePublicForm(f.id); toast.success("Deleted"); refresh(); }
                      catch { toast.error("Delete failed"); }
                    }}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                {f.status !== "published" && <p className="text-[11px] text-amber-600">Publish the form (in its editor) to share or embed it.</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* New form dialog */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New form</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Contact us / Get a quote" />
            </div>
            <div className="space-y-1.5">
              <Label>Description (optional)</Label>
              <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Shown at the top of the form" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>Cancel</Button>
            <Button onClick={create} disabled={busy}>{busy ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null} Create & build</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Embed dialog */}
      <Dialog open={!!embedFor} onOpenChange={(v) => !v && setEmbedFor(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Embed “{embedFor?.name}”</DialogTitle></DialogHeader>
          {embedFor && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Public link</Label>
                <div className="flex gap-1.5">
                  <Input readOnly value={publicUrl(embedFor.slug)} className="text-xs" onClick={(e) => (e.target as HTMLInputElement).select()} />
                  <Button size="icon" variant="outline" className="shrink-0" onClick={() => copy(publicUrl(embedFor.slug), "Link copied")}><Copy className="w-4 h-4" /></Button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Embed code — paste into your website&apos;s HTML</Label>
                <Textarea readOnly rows={4} className="font-mono text-[11px]" value={embedSnippet(baseUrl, embedFor.slug)} onClick={(e) => (e.target as HTMLTextAreaElement).select()} />
                <Button size="sm" variant="outline" onClick={() => copy(embedSnippet(baseUrl, embedFor.slug), "Embed code copied")}>
                  <Copy className="w-3.5 h-3.5 mr-1.5" /> Copy embed code
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
