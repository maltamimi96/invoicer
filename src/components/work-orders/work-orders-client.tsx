"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Wrench, Trash2, MoreHorizontal, MapPin, Calendar, Camera, Briefcase } from "@/components/ui/icons";
import { toast } from "sonner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { CleanupButton } from "@/components/cleanup/cleanup-button";
import { deleteWorkOrder } from "@/lib/actions/work-orders";
import {
  StatTile, KireiTabs, KireiPill, EmptyState, AnimatedPress, FadeIn, GradientTile,
} from "@/components/ui/kirei";
import type { GradientName as KireiGradient } from "@/components/ui/kirei";
import type { WorkOrderWithCustomer, WorkOrderStatus, BusinessMember } from "@/types/database";
import type { Role } from "@/lib/permissions";
import { canManageTeam } from "@/lib/permissions";

const TABS: { value: WorkOrderStatus | "all"; label: string }[] = [
  { value: "all",         label: "All"         },
  { value: "draft",       label: "Draft"       },
  { value: "assigned",    label: "Assigned"    },
  { value: "in_progress", label: "In progress" },
  { value: "submitted",   label: "Submitted"   },
  { value: "reviewed",    label: "Reviewed"    },
  { value: "completed",   label: "Completed"   },
];

const STATUS_GRADIENT: Record<WorkOrderStatus, KireiGradient> = {
  draft:       "primary",
  assigned:    "blue",
  in_progress: "amber",
  submitted:   "violet",
  reviewed:    "violet",
  completed:   "emerald",
  cancelled:   "rose",
};

interface WorkOrdersClientProps {
  workOrders: WorkOrderWithCustomer[];
  members: BusinessMember[];
  userRole: Role;
}

export function WorkOrdersClient({ workOrders, userRole }: WorkOrdersClientProps) {
  const canDelete = canManageTeam(userRole);
  const router = useRouter();
  const [tab, setTab] = useState<typeof TABS[number]["value"]>("all");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(
    () => tab === "all" ? workOrders : workOrders.filter((w) => w.status === tab),
    [workOrders, tab]
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: workOrders.length };
    for (const t of TABS) c[t.value] = workOrders.filter((w) => t.value === "all" || w.status === t.value).length;
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
    <div className="space-y-6">
      <PageHeader
        title="Work Orders"
        subtitle={`${workOrders.length} total · ${stats.onSite} on site now`}
        accent="linear-gradient(180deg, #fbbf24 0%, #b45309 100%)"
        actions={
          <>
            <CleanupButton entity="work_orders" entityLabel="work orders" />
            <Link href="/work-orders/new">
              <AnimatedPress className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold shadow-sm">
                <Plus className="w-4 h-4" /> New work order
              </AnimatedPress>
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <FadeIn delay={60}><StatTile gradient="softAmber" toneColor="#78350f" icon={<Calendar className="w-3.5 h-3.5" />} label="Today"        value={String(stats.todayCount)}  sub={stats.todayCount === 1 ? "scheduled job" : "scheduled jobs"} /></FadeIn>
        <FadeIn delay={110}><StatTile gradient="softBlue"  toneColor="#1e3a8a" icon={<Wrench   className="w-3.5 h-3.5" />} label="On site now"  value={String(stats.onSite)}      sub="in progress" /></FadeIn>
        <FadeIn delay={160}><StatTile gradient="softViolet"toneColor="#3b1d6b" icon={<Wrench   className="w-3.5 h-3.5" />} label="Needs review" value={String(stats.needsReview)} sub="submitted by workers" /></FadeIn>
        <FadeIn delay={210}><StatTile gradient="softTeal"  toneColor="#064e3b" icon={<Wrench   className="w-3.5 h-3.5" />} label="Completed"    value={String(stats.completed)}   sub="all time" /></FadeIn>
      </div>

      <KireiTabs
        value={tab}
        onChange={setTab}
        tabs={TABS.map((t) => ({ value: t.value, label: t.label, count: counts[t.value] ?? 0 }))}
      />

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Wrench className="w-7 h-7" />}
          gradient="amber"
          title="No work orders"
          hint="Send workers on-site to capture photos. AI generates a scope of work from what they find."
          cta={{ label: "New work order", href: "/work-orders/new", icon: <Plus className="w-4 h-4" /> }}
        />
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-muted/40 text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">
            <span className="flex-1">Job</span>
            <span className="hidden lg:block w-44">Customer</span>
            <span className="hidden md:block w-44">Address</span>
            <span className="hidden md:block w-28">Scheduled</span>
            <span className="hidden md:block w-12 text-center">Photos</span>
            <span className="w-24 text-right">Status</span>
            <span className="w-8" />
          </div>
          <div className="divide-y divide-border/60">
            {filtered.map((wo) => (
              <div
                key={wo.id}
                onClick={() => router.push(`/work-orders/${wo.id}`)}
                className="group flex flex-wrap items-center gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-muted/40"
              >
                <GradientTile gradient={STATUS_GRADIENT[wo.status] ?? "primary"} size={40} radius={10}>
                  <Briefcase className="w-4 h-4" />
                </GradientTile>
                <div className="flex-1 min-w-[140px] basis-0">
                  <div className="text-sm font-semibold break-words">{wo.title}</div>
                  <div className="font-mono text-xs text-muted-foreground break-words">
                    {wo.number}
                    <span className="md:hidden text-muted-foreground/70">
                      {wo.customers?.name ? ` · ${wo.customers.name}` : ""}
                    </span>
                  </div>
                </div>
                <div className="hidden lg:block w-44 text-xs text-muted-foreground break-words">{wo.customers?.name ?? "—"}</div>
                <div className="hidden md:block w-44 text-xs text-muted-foreground break-words">
                  {wo.property_address ? (
                    <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3 shrink-0" />{wo.property_address}</span>
                  ) : "—"}
                </div>
                <div className="hidden md:block w-28 text-xs text-muted-foreground">
                  {wo.scheduled_date ? (
                    <span className="inline-flex items-center gap-1"><Calendar className="w-3 h-3" />{wo.scheduled_date}</span>
                  ) : "—"}
                </div>
                <div className="hidden md:block w-12 text-center text-xs text-muted-foreground">
                  {(wo.photos?.length ?? 0) > 0 ? (
                    <span className="inline-flex items-center gap-0.5"><Camera className="w-3 h-3" />{wo.photos?.length}</span>
                  ) : "—"}
                </div>
                <div className="ml-auto text-right">
                  <KireiPill tone={wo.status} />
                </div>
                <div className="w-8 text-right shrink-0" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="inline-flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild><Link href={`/work-orders/${wo.id}`}>View</Link></DropdownMenuItem>
                      {canDelete && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => setDeleteId(wo.id)} className="text-destructive gap-2">
                            <Trash2 className="w-3.5 h-3.5" />Delete
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>
        </div>
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
