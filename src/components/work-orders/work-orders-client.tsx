"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Plus, Wrench, Trash2, MoreHorizontal, MapPin, User, Calendar } from "@/components/ui/icons";
import { toast } from "sonner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { deleteWorkOrder } from "@/lib/actions/work-orders";
import type { WorkOrderWithCustomer, WorkOrderStatus, BusinessMember } from "@/types/database";

const TABS: { id: WorkOrderStatus | "all"; label: string }[] = [
  { id: "all",         label: "All"         },
  { id: "draft",       label: "Draft"       },
  { id: "assigned",    label: "Assigned"    },
  { id: "in_progress", label: "In Progress" },
  { id: "submitted",   label: "Submitted"   },
  { id: "reviewed",    label: "Reviewed"    },
  { id: "completed",   label: "Completed"   },
];

const STATUS_TO_PILL: Record<WorkOrderStatus, string> = {
  draft: "draft", assigned: "scheduled", in_progress: "in-progress",
  submitted: "pending", reviewed: "pending", completed: "completed", cancelled: "cancelled",
};

interface WorkOrdersClientProps {
  workOrders: WorkOrderWithCustomer[];
  members: BusinessMember[];
}

export function WorkOrdersClient({ workOrders }: WorkOrdersClientProps) {
  const router = useRouter();
  const [tab, setTab] = useState<typeof TABS[number]["id"]>("all");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(
    () => tab === "all" ? workOrders : workOrders.filter((w) => w.status === tab),
    [workOrders, tab]
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: workOrders.length };
    for (const t of TABS) c[t.id] = workOrders.filter((w) => t.id === "all" || w.status === t.id).length;
    return c;
  }, [workOrders]);

  const todayStr = new Date().toISOString().split("T")[0];
  const stats = useMemo(() => ({
    todayCount:  workOrders.filter((w) => w.scheduled_date === todayStr).length,
    onSite:      workOrders.filter((w) => w.status === "in_progress").length,
    needsReview: workOrders.filter((w) => w.status === "submitted").length,
    completed:   workOrders.filter((w) => w.status === "completed").length,
  }), [workOrders, todayStr]);

  const handleDelete = async () => {
    if (!deleteId) return;
    setBusy(true);
    try {
      await deleteWorkOrder(deleteId);
      toast.success("Work order deleted");
      router.refresh();
    } catch { toast.error("Failed to delete"); }
    setBusy(false);
    setDeleteId(null);
  };

  return (
    <div>
      <PageHeader
        title="Work Orders"
        subtitle={`${workOrders.length} total · ${stats.onSite} on site now`}
        actions={
          <Link href="/work-orders/new">
            <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity">
              <Plus className="w-3.5 h-3.5" /> New work order
            </button>
          </Link>
        }
      />

      <div className="ch-stat-grid">
        <Stat icon={<Calendar className="w-3.5 h-3.5" />} label="Today" value={stats.todayCount} sub={stats.todayCount === 1 ? "scheduled job" : "scheduled jobs"} />
        <Stat icon={<Wrench className="w-3.5 h-3.5" />} label="On site now" value={stats.onSite} sub="in progress" />
        <Stat icon={<Wrench className="w-3.5 h-3.5" />} label="Needs review" value={stats.needsReview} sub="submitted by workers" />
        <Stat icon={<Wrench className="w-3.5 h-3.5" />} label="Completed" value={stats.completed} sub="all time" />
      </div>

      <div className="ch-tabs">
        {TABS.map((t) => (
          <button key={t.id} className={`ch-tab ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
            {t.label}<span className="count">{counts[t.id] ?? 0}</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="ch-empty">
          <Wrench className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <h4>No work orders</h4>
          <p>Send workers on-site to capture photos. AI generates a scope of work from what they find.</p>
          <Link href="/work-orders/new">
            <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium">
              <Plus className="w-3 h-3" /> Create work order
            </button>
          </Link>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}
          className="ch-table-wrap"
        >
          <table className="ch-table">
            <thead>
              <tr>
                <th>Job</th>
                <th>Customer</th>
                <th>Address</th>
                <th>Assigned</th>
                <th>Scheduled</th>
                <th>Status</th>
                <th>Photos</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((wo) => (
                <tr key={wo.id} onClick={() => router.push(`/work-orders/${wo.id}`)}>
                  <td>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-7 h-7 rounded-md bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center flex-shrink-0">
                        <Wrench className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{wo.title}</div>
                        <div className="ref">{wo.number}</div>
                      </div>
                    </div>
                  </td>
                  <td>{wo.customers?.name ?? "—"}</td>
                  <td className="text-muted-foreground">
                    {wo.property_address ? (
                      <span className="inline-flex items-center gap-1.5"><MapPin className="w-3 h-3" />{wo.property_address}</span>
                    ) : "—"}
                  </td>
                  <td className="text-muted-foreground">
                    {wo.assigned_to_email ? (
                      <span className="inline-flex items-center gap-1.5"><User className="w-3 h-3" />{wo.assigned_to_email}</span>
                    ) : "—"}
                  </td>
                  <td className="text-muted-foreground">{wo.scheduled_date ?? "—"}</td>
                  <td><span className={`ch-pill ${STATUS_TO_PILL[wo.status]}`}>{wo.status.replace("_", " ")}</span></td>
                  <td className="num">{wo.photos?.length ?? 0}</td>
                  <td className="text-right" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="inline-flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:bg-muted">
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild><Link href={`/work-orders/${wo.id}`}>View</Link></DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setDeleteId(wo.id)} className="text-destructive gap-2">
                          <Trash2 className="w-3.5 h-3.5" />Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </motion.div>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete work order?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete the order and all associated photos.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleDelete} disabled={busy}>
              {busy ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Stat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: number; sub: string }) {
  return (
    <div className="ch-stat">
      <div className="ch-stat-label">{icon}<span>{label}</span></div>
      <div className="ch-stat-value">{value}</div>
      <div className="ch-stat-meta">{sub}</div>
    </div>
  );
}
