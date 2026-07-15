"use client";

import { useState, useTransition, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Target, Plus, Search } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/layout/page-header";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { createProspect } from "@/lib/actions/prospects";
import type { Prospect, ProspectStatus } from "@/types/database";

const STATUSES: ProspectStatus[] = ["new", "contacted", "responded", "qualified", "unqualified", "converted"];
const TONE: Record<string, string> = {
  new: "bg-muted text-muted-foreground", contacted: "bg-blue-100 text-blue-700", responded: "bg-violet-100 text-violet-700",
  qualified: "bg-emerald-100 text-emerald-700", unqualified: "bg-red-100 text-red-700", converted: "bg-emerald-600 text-white",
};
const selectCls = "h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring";

export function ProspectsView({ prospects }: { prospects: Prospect[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProspectStatus | "">("");

  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [company, setCompany] = useState("");
  const [phone, setPhone] = useState(""); const [source, setSource] = useState("");

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return prospects.filter((p) => {
      if (statusFilter && p.status !== statusFilter) return false;
      if (s && !`${p.name ?? ""} ${p.email ?? ""} ${p.company ?? ""}`.toLowerCase().includes(s)) return false;
      return true;
    });
  }, [prospects, search, statusFilter]);

  function handleAdd() {
    if (!name.trim() && !email.trim()) { toast.error("Enter a name or email"); return; }
    startTransition(async () => {
      try {
        await createProspect({ name, email, company, phone, source });
        toast.success("Prospect added");
        setOpen(false); setName(""); setEmail(""); setCompany(""); setPhone(""); setSource("");
        router.refresh();
      } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't add"); }
    });
  }

  return (
    <>
      <PageHeader
        title="Prospects"
        subtitle="Your cold-outreach list — import, reach out, and convert the good ones to leads"
        actions={<Button onClick={() => setOpen(true)} disabled={isPending}><Plus className="w-4 h-4 mr-1.5" /> Add prospect</Button>}
      />

      {/* Filters */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, company…" className="pl-8" />
        </div>
        <select className={selectCls} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as ProspectStatus | "")}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s} className="capitalize">{s}</option>)}
        </select>
      </div>

      {prospects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
          <div className="w-12 h-12 rounded-xl bg-muted mx-auto flex items-center justify-center mb-3"><Target className="w-6 h-6 text-muted-foreground" /></div>
          <p className="font-semibold">No prospects yet</p>
          <p className="text-sm text-muted-foreground mt-1">Add prospects manually, or import a list. Reach out, and convert the interested ones to leads.</p>
          <Button className="mt-4" onClick={() => setOpen(true)}><Plus className="w-4 h-4 mr-1.5" /> Add prospect</Button>
        </div>
      ) : (
        <div className="ch-table-wrap">
          <table className="ch-table w-full">
            <thead><tr><th>Name</th><th>Company</th><th>Email</th><th>Source</th><th>Status</th></tr></thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="cursor-pointer hover:bg-muted/40" onClick={() => router.push(`/prospects/${p.id}`)}>
                  <td className="font-medium">{p.name || "—"}</td>
                  <td>{p.company || "—"}</td>
                  <td className="break-words">{p.email || "—"}</td>
                  <td>{p.source || "—"}</td>
                  <td><span className={cn("text-[11px] font-medium rounded-full px-2 py-0.5 capitalize", TONE[p.status])}>{p.status}</span></td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={5} className="text-center text-muted-foreground py-6">No prospects match.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground mt-3">
        <Link href="/prospects" className="underline">CSV import, bulk actions and outreach</Link> arrive with the next updates.
      </p>

      {/* Add dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add prospect</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label htmlFor="p-name">Name</Label><Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="p-company">Company</Label><Input id="p-company" value={company} onChange={(e) => setCompany(e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label htmlFor="p-email">Email</Label><Input id="p-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="p-phone">Phone</Label><Input id="p-phone" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
            </div>
            <div className="space-y-1.5"><Label htmlFor="p-source">Source</Label><Input id="p-source" placeholder="e.g. LinkedIn, referral, list" value={source} onChange={(e) => setSource(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={isPending}>Cancel</Button>
            <Button onClick={handleAdd} disabled={isPending}>Add prospect</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
