"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Hammer, Plus, Trash2, Wrench } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/layout/page-header";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { createAsset, updateAsset, deleteAsset, logAssetService } from "@/lib/actions/assets";
import type { Asset, AssetCategory, AssetStatus } from "@/types/database";

interface Member { id: string; name: string }
interface Props { assets: Asset[]; members: Member[] }

const CATEGORIES: AssetCategory[] = ["tool", "vehicle", "equipment", "other"];
const STATUS_TONE: Record<string, string> = { active: "bg-emerald-100 text-emerald-700", in_repair: "bg-amber-100 text-amber-700", retired: "bg-muted text-muted-foreground" };
const selectCls = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring";
const todayISO = () => new Date().toISOString().split("T")[0];

export function AssetsView({ assets, members }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [addOpen, setAddOpen] = useState(false);
  const [serviceFor, setServiceFor] = useState<Asset | null>(null);

  // add form
  const [name, setName] = useState(""); const [category, setCategory] = useState<AssetCategory>("tool");
  const [identifier, setIdentifier] = useState(""); const [assignedTo, setAssignedTo] = useState("");
  const [nextService, setNextService] = useState(""); const [cost, setCost] = useState("");
  // service form
  const [svcDate, setSvcDate] = useState(todayISO()); const [svcDesc, setSvcDesc] = useState(""); const [svcCost, setSvcCost] = useState(""); const [svcNext, setSvcNext] = useState("");

  const memberName = (id: string | null) => id ? (members.find((m) => m.id === id)?.name ?? null) : null;
  const soon = (d: string | null) => d != null && d <= new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0];
  const dueCount = assets.filter((a) => a.status !== "retired" && soon(a.next_service_on)).length;
  const inRepair = assets.filter((a) => a.status === "in_repair").length;

  function handleAdd() {
    if (!name.trim()) { toast.error("Enter a name"); return; }
    startTransition(async () => {
      try {
        await createAsset({ name, category, identifier, assigned_to: assignedTo || null, next_service_on: nextService || null, purchase_cost: cost || null });
        toast.success("Asset added");
        setAddOpen(false); setName(""); setCategory("tool"); setIdentifier(""); setAssignedTo(""); setNextService(""); setCost("");
        router.refresh();
      } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't add"); }
    });
  }
  function handleStatus(a: Asset, status: AssetStatus) {
    startTransition(async () => { try { await updateAsset(a.id, { status }); router.refresh(); } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't update"); } });
  }
  function handleDelete(id: string) {
    startTransition(async () => { try { await deleteAsset(id); toast.success("Deleted"); router.refresh(); } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't delete"); } });
  }
  function handleLogService() {
    if (!serviceFor) return;
    startTransition(async () => {
      try {
        await logAssetService({ asset_id: serviceFor.id, serviced_on: svcDate, description: svcDesc, cost: svcCost || null, next_due: svcNext || null });
        toast.success("Service logged");
        setServiceFor(null); setSvcDate(todayISO()); setSvcDesc(""); setSvcCost(""); setSvcNext("");
        router.refresh();
      } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't log"); }
    });
  }

  return (
    <>
      <PageHeader title="Assets & equipment" subtitle="Tools, vehicles and equipment — assignment and service schedules"
        actions={<Button onClick={() => setAddOpen(true)} disabled={isPending}><Plus className="w-4 h-4 mr-1.5" /> Add asset</Button>} />

      <div className="grid grid-cols-3 gap-3 mb-6">
        <Stat label="Assets" value={String(assets.length)} />
        <Stat label="In repair" value={String(inRepair)} tone={inRepair ? "warn" : undefined} />
        <Stat label="Service due soon" value={String(dueCount)} tone={dueCount ? "warn" : undefined} />
      </div>

      {assets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
          <div className="w-12 h-12 rounded-xl bg-muted mx-auto flex items-center justify-center mb-3"><Hammer className="w-6 h-6 text-muted-foreground" /></div>
          <p className="font-semibold">No assets yet</p>
          <p className="text-sm text-muted-foreground mt-1">Add your tools, vehicles and equipment to track assignment and servicing.</p>
          <Button className="mt-4" onClick={() => setAddOpen(true)}><Plus className="w-4 h-4 mr-1.5" /> Add asset</Button>
        </div>
      ) : (
        <div className="ch-table-wrap">
          <table className="ch-table w-full">
            <thead><tr><th>Asset</th><th>Category</th><th>Assigned</th><th>Next service</th><th>Status</th><th></th><th></th></tr></thead>
            <tbody>
              {assets.map((a) => (
                <tr key={a.id}>
                  <td className="break-words font-medium">{a.name}{a.identifier && <span className="text-muted-foreground text-xs"> · {a.identifier}</span>}</td>
                  <td className="capitalize">{a.category}</td>
                  <td>{memberName(a.assigned_to) ?? "—"}</td>
                  <td>{a.next_service_on ? <span className={cn(soon(a.next_service_on) && a.status !== "retired" && "text-amber-600 font-medium")}>{new Date(a.next_service_on).toLocaleDateString("en-AU")}</span> : "—"}</td>
                  <td>
                    <select value={a.status} onChange={(e) => handleStatus(a, e.target.value as AssetStatus)} className={cn("text-[11px] rounded-full px-2 py-0.5 border-0 outline-none", STATUS_TONE[a.status])}>
                      <option value="active">active</option><option value="in_repair">in repair</option><option value="retired">retired</option>
                    </select>
                  </td>
                  <td><button onClick={() => setServiceFor(a)} className="text-muted-foreground hover:text-foreground" title="Log service"><Wrench className="w-4 h-4" /></button></td>
                  <td><button onClick={() => handleDelete(a.id)} disabled={isPending} className="text-muted-foreground hover:text-destructive" aria-label="Delete"><Trash2 className="w-4 h-4" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add asset</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label htmlFor="as-name">Name</Label><Input id="as-name" value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label htmlFor="as-cat">Category</Label>
                <select id="as-cat" className={selectCls} value={category} onChange={(e) => setCategory(e.target.value as AssetCategory)}>{CATEGORIES.map((c) => <option key={c} value={c} className="capitalize">{c}</option>)}</select>
              </div>
              <div className="space-y-1.5"><Label htmlFor="as-id">Serial / rego</Label><Input id="as-id" value={identifier} onChange={(e) => setIdentifier(e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label htmlFor="as-assign">Assigned to</Label>
                <select id="as-assign" className={selectCls} value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
                  <option value="">— Unassigned —</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
              <div className="space-y-1.5"><Label htmlFor="as-next">Next service</Label><Input id="as-next" type="date" value={nextService} onChange={(e) => setNextService(e.target.value)} /></div>
            </div>
            <div className="space-y-1.5"><Label htmlFor="as-cost">Purchase cost</Label><Input id="as-cost" type="number" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)} disabled={isPending}>Cancel</Button>
            <Button onClick={handleAdd} disabled={isPending}>Add asset</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Log service */}
      <Dialog open={!!serviceFor} onOpenChange={(o) => !o && setServiceFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Log service — {serviceFor?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label htmlFor="sv-date">Serviced on</Label><Input id="sv-date" type="date" value={svcDate} onChange={(e) => setSvcDate(e.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="sv-next">Next due</Label><Input id="sv-next" type="date" value={svcNext} onChange={(e) => setSvcNext(e.target.value)} /></div>
            </div>
            <div className="space-y-1.5"><Label htmlFor="sv-cost">Cost</Label><Input id="sv-cost" type="number" step="0.01" value={svcCost} onChange={(e) => setSvcCost(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="sv-desc">What was done</Label><Textarea id="sv-desc" rows={2} value={svcDesc} onChange={(e) => setSvcDesc(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setServiceFor(null)} disabled={isPending}>Cancel</Button>
            <Button onClick={handleLogService} disabled={isPending}>Log service</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn("text-2xl font-bold mt-1", tone === "warn" && "text-amber-600")}>{value}</p>
    </div>
  );
}
