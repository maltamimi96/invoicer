"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Search, Plus, Trash2, Globe, Workflow } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/layout/page-header";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { createSeoSite, deleteSeoSite } from "@/lib/actions/seo";
import type { SeoSite, SeoPlatform, SeoPlaybook } from "@/types/database";

interface Props {
  sites: SeoSite[];
  customers: { id: string; name: string }[];
}

const PLATFORM_LABEL: Record<SeoPlatform, string> = {
  wordpress: "WordPress", shopify: "Shopify", other: "Other",
};
const PLAYBOOK_LABEL: Record<SeoPlaybook, string> = {
  local: "Local", ecommerce: "E-commerce",
};

const selectCls =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring";

export function SeoSitesView({ sites, customers }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SeoSite | null>(null);

  // add-form state
  const [domain, setDomain] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [platform, setPlatform] = useState<SeoPlatform>("other");
  const [playbook, setPlaybook] = useState<SeoPlaybook>("local");
  const [notes, setNotes] = useState("");

  function resetForm() {
    setDomain(""); setCustomerId(""); setPlatform("other"); setPlaybook("local"); setNotes("");
  }

  function handleAdd() {
    if (!domain.trim()) { toast.error("Enter a domain"); return; }
    startTransition(async () => {
      try {
        await createSeoSite({
          domain,
          customer_id: customerId || null,
          platform, playbook,
          notes: notes || null,
        });
        toast.success("Client site added");
        setAddOpen(false);
        resetForm();
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't add site");
      }
    });
  }

  function handleDelete(site: SeoSite) {
    startTransition(async () => {
      try {
        await deleteSeoSite(site.id);
        toast.success("Site removed");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't remove site");
      } finally {
        setDeleteTarget(null);
      }
    });
  }

  const customerName = (id: string | null) =>
    id ? customers.find((c) => c.id === id)?.name ?? null : null;

  return (
    <>
      <PageHeader
        title="SEO Production"
        subtitle="Client sites you manage — connectors, opportunities and content pipeline"
        accent="linear-gradient(180deg, #10b981 0%, #047857 100%)"
        actions={
          <>
            <Link
              href="/seo/pipeline"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground rounded-md border border-border px-3 py-1.5"
            >
              <Workflow className="w-4 h-4" /> Pipeline
            </Link>
            <Button onClick={() => setAddOpen(true)} disabled={isPending}>
              <Plus className="w-4 h-4 mr-1.5" /> Add site
            </Button>
          </>
        }
      />

      {sites.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
          <div className="w-12 h-12 rounded-xl bg-muted mx-auto flex items-center justify-center mb-3">
            <Search className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="font-semibold">No client sites yet</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
            Add the first site you manage. Connectors, the opportunity queue and the content pipeline all hang off a site.
          </p>
          <Button className="mt-4" onClick={() => setAddOpen(true)}>
            <Plus className="w-4 h-4 mr-1.5" /> Add your first site
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {sites.map((site) => (
            <div key={site.id} className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <Globe className="w-4.5 h-4.5 text-foreground/70" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold break-words">{site.domain}</p>
                  {customerName(site.customer_id) && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{customerName(site.customer_id)}</p>
                  )}
                </div>
                <button
                  onClick={() => setDeleteTarget(site)}
                  disabled={isPending}
                  className="text-muted-foreground hover:text-destructive shrink-0"
                  aria-label="Remove site"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-medium bg-muted rounded-full px-2 py-0.5">{PLATFORM_LABEL[site.platform]}</span>
                <span className="text-[10px] font-medium bg-muted rounded-full px-2 py-0.5">{PLAYBOOK_LABEL[site.playbook]}</span>
                <span className={`text-[10px] font-medium rounded-full px-2 py-0.5 ${site.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}`}>{site.status}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add-site dialog */}
      <Dialog open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (!o) resetForm(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a client site</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="seo-domain">Domain</Label>
              <Input id="seo-domain" placeholder="example.com" value={domain} onChange={(e) => setDomain(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="seo-customer">Client (optional)</Label>
              <select id="seo-customer" className={selectCls} value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                <option value="">— No linked client —</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="seo-platform">Platform</Label>
                <select id="seo-platform" className={selectCls} value={platform} onChange={(e) => setPlatform(e.target.value as SeoPlatform)}>
                  <option value="other">Other</option>
                  <option value="wordpress">WordPress</option>
                  <option value="shopify">Shopify</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="seo-playbook">Playbook</Label>
                <select id="seo-playbook" className={selectCls} value={playbook} onChange={(e) => setPlaybook(e.target.value as SeoPlaybook)}>
                  <option value="local">Local</option>
                  <option value="ecommerce">E-commerce</option>
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="seo-notes">Notes (optional)</Label>
              <Textarea id="seo-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)} disabled={isPending}>Cancel</Button>
            <Button onClick={handleAdd} disabled={isPending}>Add site</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {deleteTarget?.domain}?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes the site and all its SEO data (connections, keyword history, content). This can’t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => deleteTarget && handleDelete(deleteTarget)}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
