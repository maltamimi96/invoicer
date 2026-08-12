"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, FileText, Upload, Loader2 } from "@/components/ui/icons";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { createContract, createContractPdfUpload } from "@/lib/actions/contracts";
import { putSignedUpload } from "@/lib/uploads-client";
import { CONTRACT_MERGE_FIELDS } from "@/lib/contracts/merge-fields";
import { formatDate } from "@/lib/utils";
import type { Contract, ContractTemplate, Customer } from "@/types/database";

const STATUS_TONES: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  viewed: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  signed: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  declined: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  voided: "bg-muted text-muted-foreground line-through",
};

interface Props {
  initial: Contract[];
  customers: Customer[];
  templates: ContractTemplate[];
}

export function ContractsClient({ initial, customers, templates }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<"rich_text" | "pdf">("rich_text");
  const [title, setTitle] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [content, setContent] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);

  const reset = () => { setTitle(""); setCustomerId(""); setContent(""); setPdfFile(null); setMode("rich_text"); };

  const applyTemplate = (tplId: string) => {
    const t = templates.find((x) => x.id === tplId);
    if (t) { setContent(t.content_html); if (!title) setTitle(t.name); }
  };

  const create = async () => {
    if (!title.trim()) return toast.error("Add a title");
    if (!customerId) return toast.error("Pick a customer");
    setSaving(true);
    try {
      let source_path: string | undefined;
      if (mode === "pdf") {
        if (!pdfFile) { setSaving(false); return toast.error("Choose a PDF"); }
        const upload = await createContractPdfUpload(pdfFile.name, pdfFile.type, pdfFile.size);
        await putSignedUpload("contracts", upload, pdfFile);
        source_path = upload.path;
      } else if (!content.trim()) {
        setSaving(false); return toast.error("Write the contract content");
      }
      const c = await createContract({
        title: title.trim(), customer_id: customerId, kind: mode,
        content_html: mode === "rich_text" ? content : null,
        source_path: source_path ?? null,
      });
      toast.success("Contract created");
      setOpen(false); reset();
      router.push(`/contracts/${c.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't create contract");
    } finally { setSaving(false); }
  };

  const customerName = (id: string | null) => customers.find((c) => c.id === id)?.name ?? "—";

  return (
    <div>
      <PageHeader
        title="Contracts"
        subtitle="Create agreements and send them to customers to sign"
        actions={<Button onClick={() => { reset(); setOpen(true); }}><Plus className="w-4 h-4 mr-1.5" /> New contract</Button>}
      />

      {initial.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <FileText className="w-8 h-8 mx-auto mb-3 opacity-40" />
          <p className="font-medium">No contracts yet</p>
          <p className="text-sm mt-1">Create one from a template, rich text, or an uploaded PDF.</p>
        </CardContent></Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Title</th>
                <th className="text-left px-4 py-3 font-semibold">Customer</th>
                <th className="text-left px-4 py-3 font-semibold">Status</th>
                <th className="text-left px-4 py-3 font-semibold">Created</th>
              </tr>
            </thead>
            <tbody>
              {initial.map((c) => (
                <tr key={c.id} className="border-t border-border/50 hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <Link href={`/contracts/${c.id}`} className="font-medium hover:underline break-words">{c.title}</Link>
                    <span className="ml-2 text-xs text-muted-foreground">{c.kind === "pdf" ? "PDF" : "Text"}</span>
                  </td>
                  <td className="px-4 py-3 break-words">{customerName(c.customer_id)}</td>
                  <td className="px-4 py-3"><Badge variant="secondary" className={STATUS_TONES[c.status] ?? ""}>{c.status}</Badge></td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(c.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New contract</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Service Agreement — Acme" />
            </div>
            <div className="space-y-1.5">
              <Label>Customer</Label>
              <SearchableSelect value={customerId} onValueChange={setCustomerId}
                items={customers.map((c) => ({ value: c.id, label: c.name, sublabel: c.email ?? undefined }))}
                placeholder="Select customer" />
            </div>

            <Tabs value={mode} onValueChange={(v) => setMode(v as "rich_text" | "pdf")}>
              <TabsList>
                <TabsTrigger value="rich_text"><FileText className="w-3.5 h-3.5 mr-1.5" /> Write / template</TabsTrigger>
                <TabsTrigger value="pdf"><Upload className="w-3.5 h-3.5 mr-1.5" /> Upload PDF</TabsTrigger>
              </TabsList>
            </Tabs>

            {mode === "rich_text" ? (
              <div className="space-y-2">
                {templates.length > 0 && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Start from a template (optional)</Label>
                    <SearchableSelect value="" onValueChange={applyTemplate}
                      items={templates.map((t) => ({ value: t.id, label: t.name }))} placeholder="Pick a template" />
                  </div>
                )}
                <Textarea rows={10} value={content} onChange={(e) => setContent(e.target.value)} className="font-mono text-xs"
                  placeholder="Write the contract. Basic HTML allowed. Use merge fields like {{customer_name}}." />
                <div className="flex flex-wrap gap-1.5">
                  {CONTRACT_MERGE_FIELDS.map((f) => (
                    <button key={f} type="button"
                      onClick={() => setContent((c) => c + `{{${f}}}`)}
                      className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-muted border border-border hover:border-primary">
                      {`{{${f}}}`}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>Contract PDF</Label>
                <Input type="file" accept="application/pdf" onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)} />
                {pdfFile && <p className="text-xs text-muted-foreground">{pdfFile.name} · {(pdfFile.size / 1024 / 1024).toFixed(1)} MB</p>}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={create} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null} Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
