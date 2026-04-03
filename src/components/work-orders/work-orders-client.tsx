"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Plus, Wrench, Trash2, Eye, User } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { deleteWorkOrder } from "@/lib/actions/work-orders";
import type { WorkOrderWithCustomer, WorkOrderStatus, BusinessMember } from "@/types/database";

const STATUS_TABS: { label: string; value: WorkOrderStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Draft", value: "draft" },
  { label: "Assigned", value: "assigned" },
  { label: "In Progress", value: "in_progress" },
  { label: "Submitted", value: "submitted" },
  { label: "Reviewed", value: "reviewed" },
  { label: "Completed", value: "completed" },
];

const STATUS_STYLES: Record<WorkOrderStatus, string> = {
  draft:       "bg-slate-100 text-slate-700",
  assigned:    "bg-blue-100 text-blue-700",
  in_progress: "bg-orange-100 text-orange-700",
  submitted:   "bg-purple-100 text-purple-700",
  reviewed:    "bg-yellow-100 text-yellow-700",
  completed:   "bg-green-100 text-green-700",
  cancelled:   "bg-red-100 text-red-700",
};

const STATUS_LABELS: Record<WorkOrderStatus, string> = {
  draft:       "Draft",
  assigned:    "Assigned",
  in_progress: "In Progress",
  submitted:   "Submitted",
  reviewed:    "Reviewed",
  completed:   "Completed",
  cancelled:   "Cancelled",
};

interface WorkOrdersClientProps {
  workOrders: WorkOrderWithCustomer[];
  members: BusinessMember[];
}

export function WorkOrdersClient({ workOrders, members }: WorkOrdersClientProps) {
  const router = useRouter();
  const [tab, setTab] = useState<WorkOrderStatus | "all">("all");
  const [deleting, setDeleting] = useState<string | null>(null);

  const memberMap = Object.fromEntries(members.map((m) => [m.email, m]));

  const filtered = tab === "all" ? workOrders : workOrders.filter((w) => w.status === tab);

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      await deleteWorkOrder(id);
      toast.success("Work order deleted");
      router.refresh();
    } catch {
      toast.error("Failed to delete");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Work Orders</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{workOrders.length} total</p>
        </div>
        <Link href="/work-orders/new">
          <Button size="sm"><Plus className="w-4 h-4 mr-1.5" />New Work Order</Button>
        </Link>
      </motion.div>

      {/* Status tabs */}
      <div className="flex gap-1.5 flex-wrap">
        {STATUS_TABS.map((t) => {
          const count = t.value === "all" ? workOrders.length : workOrders.filter((w) => w.status === t.value).length;
          return (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                tab === t.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {t.label} {count > 0 && <span className="ml-1 opacity-70">{count}</span>}
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
            <Wrench className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="font-semibold text-lg mb-1">{tab === "all" ? "No work orders yet" : `No ${STATUS_LABELS[tab as WorkOrderStatus]?.toLowerCase()} orders`}</h3>
          <p className="text-sm text-muted-foreground mb-6 max-w-sm">Send workers on-site to capture photos. AI will generate a scope of work from what they find.</p>
          <Link href="/work-orders/new"><Button><Plus className="w-4 h-4 mr-1.5" />Create first work order</Button></Link>
        </motion.div>
      ) : (
        <div className="grid gap-3">
          {filtered.map((wo, i) => (
            <motion.div key={wo.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
              <Card className="hover:shadow-md transition-shadow">
                <CardContent className="p-5">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-lg bg-orange-50 flex items-center justify-center flex-shrink-0">
                      <Wrench className="w-5 h-5 text-orange-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-xs font-mono text-muted-foreground">{wo.number}</span>
                        <h3 className="font-semibold truncate">{wo.title}</h3>
                        <Badge className={`${STATUS_STYLES[wo.status]} text-xs`}>{STATUS_LABELS[wo.status]}</Badge>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground mt-1">
                        {wo.property_address && <span>{wo.property_address}</span>}
                        {wo.customers && <span>· {wo.customers.name}</span>}
                        {wo.assigned_to_email && (
                          <span className="flex items-center gap-1">
                            · <User className="w-3 h-3" />
                            {memberMap[wo.assigned_to_email]
                              ? wo.assigned_to_email
                              : wo.assigned_to_email}
                          </span>
                        )}
                        {wo.scheduled_date && <span>· {wo.scheduled_date}</span>}
                        <span>· {wo.photos.length} photo{wo.photos.length !== 1 ? "s" : ""}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Link href={`/work-orders/${wo.id}`}>
                        <Button variant="ghost" size="icon" className="h-8 w-8"><Eye className="w-4 h-4" /></Button>
                      </Link>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" disabled={deleting === wo.id}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete work order?</AlertDialogTitle>
                            <AlertDialogDescription>This will permanently delete {wo.number} and all associated photos.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => handleDelete(wo.id)}>Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
