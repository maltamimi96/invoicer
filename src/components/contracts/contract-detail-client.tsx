"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTrackedRefresh } from "@/components/layout/use-mutation";
import Link from "next/link";
import { ArrowLeft, Trash2, XCircle, Send, Download, Save, Loader2, Copy } from "@/components/ui/icons";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { updateContract, deleteContract, voidContract, getContractPdfUrl, sendContractForSignature, getContractSignLink } from "@/lib/actions/contracts";
import { formatDate } from "@/lib/utils";
import type { Contract } from "@/types/database";

const STATUS_TONES: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  viewed: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  signed: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  declined: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  voided: "bg-muted text-muted-foreground line-through",
};

interface Props {
  contract: Contract & { customers?: { name: string; email: string | null } | null };
  renderedHtml: string;
  canEdit: boolean;
}

export function ContractDetailClient({ contract, renderedHtml, canEdit }: Props) {
  const router = useRouter();
  // The scrim has to outlast the refresh: a local `finally { setBusy(false) }`
  // fires when refresh() is CALLED, not when the server output arrives.
  const { refresh } = useTrackedRefresh();
  const isDraft = contract.status === "draft";
  const isSignable = !["signed", "voided", "declined"].includes(contract.status);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(contract.title);
  const [content, setContent] = useState(contract.content_html ?? "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await updateContract(contract.id, { title: title.trim(), content_html: contract.kind === "rich_text" ? content : undefined });
      toast.success("Saved"); setEditing(false); refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save"); }
    finally { setBusy(false); }
  };

  const doVoid = async () => {
    try { await voidContract(contract.id); toast.success("Contract voided"); refresh(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't void"); }
  };

  const doDelete = async () => {
    try { await deleteContract(contract.id); toast.success("Contract deleted"); router.push("/contracts"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't delete"); }
  };

  const downloadPdf = async (which: "source" | "signed") => {
    try {
      const url = await getContractPdfUrl(contract.id, which);
      if (url) window.open(url, "_blank"); else toast.error("PDF not available");
    } catch { toast.error("Couldn't open PDF"); }
  };

  const sendForSignature = async () => {
    if (!contract.customers?.email) { toast.error("This customer has no email address"); return; }
    setBusy(true);
    try {
      await sendContractForSignature(contract.id);
      toast.success(`Emailed to ${contract.customers.email} to sign`); refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't send"); }
    finally { setBusy(false); }
  };

  const copySignLink = async () => {
    try {
      const { url } = await getContractSignLink(contract.id);
      await navigator.clipboard.writeText(url);
      toast.success("Signing link copied");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't get link"); }
  };

  return (
    <div>
      <Link href="/contracts" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="w-4 h-4" /> Contracts
      </Link>

      <PageHeader
        title={contract.title}
        subtitle={<span>For {contract.customers?.name ?? "—"} · created {formatDate(contract.created_at)}</span>}
        accent="linear-gradient(180deg, #818cf8 0%, #4f46e5 100%)"
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className={STATUS_TONES[contract.status] ?? ""}>{contract.status}</Badge>
            {canEdit && isSignable && (
              <>
                <Button variant="outline" onClick={copySignLink}><Copy className="w-4 h-4 mr-1.5" /> Copy link</Button>
                <Button onClick={sendForSignature} disabled={busy}>
                  {busy ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Send className="w-4 h-4 mr-1.5" />}
                  {contract.status === "draft" ? "Send to sign" : "Resend"}
                </Button>
              </>
            )}
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Contract</CardTitle>
            {canEdit && isDraft && contract.kind === "rich_text" && !editing && (
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>Edit</Button>
            )}
          </CardHeader>
          <CardContent>
            {contract.kind === "pdf" ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">An uploaded PDF document.</p>
                <Button variant="outline" onClick={() => downloadPdf("source")}>
                  <Download className="w-4 h-4 mr-1.5" /> View PDF
                </Button>
              </div>
            ) : editing ? (
              <div className="space-y-3">
                <Input value={title} onChange={(e) => setTitle(e.target.value)} />
                <Textarea rows={16} value={content} onChange={(e) => setContent(e.target.value)} className="font-mono text-xs" />
                <div className="flex gap-2">
                  <Button onClick={save} disabled={busy}>{busy ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />} Save</Button>
                  <Button variant="ghost" onClick={() => { setEditing(false); setContent(contract.content_html ?? ""); setTitle(contract.title); }}>Cancel</Button>
                </div>
              </div>
            ) : (
              <div className="prose prose-sm dark:prose-invert max-w-none break-words"
                dangerouslySetInnerHTML={{ __html: renderedHtml || "<p class='text-muted-foreground'>No content.</p>" }} />
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Details</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Customer" value={contract.customers?.name ?? "—"} />
              <Row label="Email" value={contract.customers?.email ?? "—"} />
              <Row label="Type" value={contract.kind === "pdf" ? "Uploaded PDF" : "Rich text"} />
              <Row label="Status" value={contract.status} />
              {contract.sent_at && <Row label="Sent" value={formatDate(contract.sent_at)} />}
              {contract.signed_at && <Row label="Signed" value={formatDate(contract.signed_at)} />}
            </CardContent>
          </Card>

          {contract.status === "signed" && contract.signed_path && (
            <Button variant="outline" className="w-full" onClick={() => downloadPdf("signed")}>
              <Download className="w-4 h-4 mr-1.5" /> Download signed PDF
            </Button>
          )}

          {canEdit && (
            <Card>
              <CardHeader><CardTitle className="text-base">Actions</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {contract.status !== "voided" && contract.status !== "signed" && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" className="w-full justify-start"><XCircle className="w-4 h-4 mr-1.5" /> Void contract</Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader><AlertDialogTitle>Void this contract?</AlertDialogTitle>
                        <AlertDialogDescription>It will be marked void and can no longer be signed.</AlertDialogDescription></AlertDialogHeader>
                      <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={doVoid}>Void</AlertDialogAction></AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-destructive hover:text-destructive"><Trash2 className="w-4 h-4 mr-1.5" /> Delete</Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader><AlertDialogTitle>Delete this contract?</AlertDialogTitle>
                      <AlertDialogDescription>This permanently removes the contract.</AlertDialogDescription></AlertDialogHeader>
                    <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={doDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right break-words">{value}</span>
    </div>
  );
}
