"use client";

import { useState, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, ImagePlus, X, Sparkles, Loader2, CheckCircle2,
  Circle, Trash2, Save, ChevronRight, User, MapPin, Calendar, Hash,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import {
  updateWorkOrderStatus, updateWorkOrderPhotos, updateWorkOrder,
  submitWorkOrder, deleteWorkOrder,
} from "@/lib/actions/work-orders";
import { createClient } from "@/lib/supabase/client";
import { canEdit, canManageTeam, type Role } from "@/lib/permissions";
import type { WorkOrderWithCustomer, WorkOrderStatus, WorkOrderPhoto, WorkOrderUpdate, MemberProfile, Customer } from "@/types/database";
import { AddressLink } from "@/components/ui/address-link";
import { WorkOrderUpdatesTimeline } from "./work-order-updates-timeline";

// ── Status pipeline ──────────────────────────────────────────────────────────

const PIPELINE: { value: WorkOrderStatus; label: string }[] = [
  { value: "draft",       label: "Draft" },
  { value: "assigned",    label: "Assigned" },
  { value: "in_progress", label: "In Progress" },
  { value: "submitted",   label: "Submitted" },
  { value: "reviewed",    label: "Reviewed" },
  { value: "completed",   label: "Completed" },
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

const PIPELINE_INDEX = Object.fromEntries(PIPELINE.map((s, i) => [s.value, i]));

// ── Component ────────────────────────────────────────────────────────────────

interface WorkOrderDetailClientProps {
  workOrder: WorkOrderWithCustomer;
  customers: Customer[];
  userRole: Role;
  currentUserId: string;
  currentUserEmail: string;
  updates?: WorkOrderUpdate[];
  assignedProfile?: Pick<MemberProfile, 'id' | 'name' | 'email' | 'avatar_url' | 'role_title'> | null;
}

export function WorkOrderDetailClient({
  workOrder: initial, customers, userRole, currentUserId, currentUserEmail,
  updates = [], assignedProfile = null,
}: WorkOrderDetailClientProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [wo, setWo] = useState(initial);
  const [isPending, startTransition] = useTransition();
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [analyzingAI, setAnalyzingAI] = useState(false);
  const [scopeOfWork, setScopeOfWork] = useState(initial.scope_of_work ?? "");
  const [workerNotes, setWorkerNotes] = useState("");
  const [savingScope, setSavingScope] = useState(false);

  const isOwnerOrAdmin = canManageTeam(userRole);
  const isEditor = canEdit(userRole);
  const isAssignedWorker = wo.assigned_to_email === currentUserEmail;
  const canUploadPhotos = isEditor && (isOwnerOrAdmin || isAssignedWorker || !wo.assigned_to);
  const canSubmit = isEditor && (isAssignedWorker || isOwnerOrAdmin) &&
    ["assigned", "in_progress"].includes(wo.status);

  // ── Status change ──────────────────────────────────────────────────────────

  const handleStatusChange = (newStatus: WorkOrderStatus) => {
    startTransition(async () => {
      try {
        await updateWorkOrderStatus(wo.id, newStatus);
        setWo((prev) => ({ ...prev, status: newStatus }));
        toast.success("Status updated");
      } catch { toast.error("Failed to update status"); }
    });
  };

  // ── Photo upload ───────────────────────────────────────────────────────────

  const handlePhotoFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploadingPhotos(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const newPhotos: WorkOrderPhoto[] = [...wo.photos];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.type.startsWith("image/")) continue;
        const ext = file.name.split(".").pop() ?? "jpg";
        const storagePath = `${user.id}/${wo.id}/${crypto.randomUUID()}.${ext}`;

        const { error } = await supabase.storage
          .from("work-order-photos")
          .upload(storagePath, file, { contentType: file.type });
        if (error) { toast.error(`Failed to upload ${file.name}`); continue; }

        const { data: { publicUrl } } = supabase.storage.from("work-order-photos").getPublicUrl(storagePath);
        newPhotos.push({
          id: crypto.randomUUID(),
          url: publicUrl,
          storagePath,
          order: newPhotos.length + 1,
          uploadedBy: user.id,
        });
      }

      await updateWorkOrderPhotos(wo.id, newPhotos);
      setWo((prev) => ({ ...prev, photos: newPhotos }));
      toast.success(`${newPhotos.length - wo.photos.length} photo${newPhotos.length - wo.photos.length !== 1 ? "s" : ""} uploaded`);

      // Auto-advance to in_progress if still assigned
      if (wo.status === "assigned") {
        await updateWorkOrderStatus(wo.id, "in_progress");
        setWo((prev) => ({ ...prev, status: "in_progress" }));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploadingPhotos(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemovePhoto = async (photoId: string) => {
    const updated = wo.photos.filter((p) => p.id !== photoId).map((p, i) => ({ ...p, order: i + 1 }));
    try {
      // Try delete from storage
      const photo = wo.photos.find((p) => p.id === photoId);
      if (photo) {
        const supabase = createClient();
        await supabase.storage.from("work-order-photos").remove([photo.storagePath]);
      }
      await updateWorkOrderPhotos(wo.id, updated);
      setWo((prev) => ({ ...prev, photos: updated }));
    } catch { toast.error("Failed to remove photo"); }
  };

  // ── AI analysis ────────────────────────────────────────────────────────────

  const handleAnalyzeWithAI = async () => {
    if (!wo.photos.length && !wo.worker_notes) {
      toast.error("Add photos or worker notes first");
      return;
    }
    setAnalyzingAI(true);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "analyze_work_order",
          imageUrls: wo.photos.map((p) => p.url),
          workerNotes: wo.worker_notes ?? "",
          title: wo.title,
          propertyAddress: wo.property_address ?? "",
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "AI failed");
      const { result } = await res.json();
      setScopeOfWork(result);
      await updateWorkOrder(wo.id, { scope_of_work: result });
      setWo((prev) => ({ ...prev, scope_of_work: result }));
      toast.success("Scope of work generated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI analysis failed");
    } finally {
      setAnalyzingAI(false);
    }
  };

  const handleSaveScope = async () => {
    setSavingScope(true);
    try {
      await updateWorkOrder(wo.id, { scope_of_work: scopeOfWork });
      setWo((prev) => ({ ...prev, scope_of_work: scopeOfWork }));
      toast.success("Scope saved");
    } catch { toast.error("Failed to save"); }
    finally { setSavingScope(false); }
  };

  // ── Submit (worker) ────────────────────────────────────────────────────────

  const handleSubmit = () => {
    startTransition(async () => {
      try {
        await submitWorkOrder(wo.id, workerNotes);
        setWo((prev) => ({ ...prev, status: "submitted", worker_notes: workerNotes }));
        toast.success("Work order submitted");
      } catch { toast.error("Failed to submit"); }
    });
  };

  // ── Delete ─────────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    try {
      await deleteWorkOrder(wo.id);
      toast.success("Work order deleted");
      router.push("/work-orders");
    } catch { toast.error("Failed to delete"); }
  };

  const currentPipelineIdx = PIPELINE_INDEX[wo.status] ?? -1;

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/work-orders">
            <Button variant="ghost" size="icon" className="h-8 w-8"><ArrowLeft className="w-4 h-4" /></Button>
          </Link>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono text-muted-foreground">{wo.number}</span>
              <h1 className="text-xl font-bold">{wo.title}</h1>
              <Badge className={STATUS_STYLES[wo.status]}>{wo.status.replace("_", " ")}</Badge>
            </div>
            {wo.property_address && (
              <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
                <MapPin className="w-3.5 h-3.5 shrink-0" />
                <AddressLink address={wo.property_address} />
              </p>
            )}
          </div>
        </div>
        {isOwnerOrAdmin && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive flex-shrink-0">
                <Trash2 className="w-4 h-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {wo.number}?</AlertDialogTitle>
                <AlertDialogDescription>This permanently deletes the work order and all its photos.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleDelete}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </motion.div>

      {/* Status pipeline */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-1 overflow-x-auto">
            {PIPELINE.map((step, idx) => {
              const isPast = idx < currentPipelineIdx;
              const isCurrent = idx === currentPipelineIdx;
              const isFuture = idx > currentPipelineIdx;
              return (
                <div key={step.value} className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => isOwnerOrAdmin && handleStatusChange(step.value)}
                    disabled={!isOwnerOrAdmin || isPending || isCurrent}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      isCurrent ? "bg-primary text-primary-foreground" :
                      isPast ? "bg-green-100 text-green-700 hover:bg-green-200" :
                      isFuture && isOwnerOrAdmin ? "text-muted-foreground hover:bg-muted" :
                      "text-muted-foreground/50 cursor-default"
                    }`}
                    title={isOwnerOrAdmin ? `Move to ${step.label}` : undefined}
                  >
                    {isPast ? (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : isCurrent ? (
                      <div className="w-2 h-2 rounded-full bg-primary-foreground" />
                    ) : (
                      <Circle className="w-3.5 h-3.5" />
                    )}
                    {step.label}
                  </button>
                  {idx < PIPELINE.length - 1 && <ChevronRight className="w-3 h-3 text-muted-foreground/40 flex-shrink-0" />}
                </div>
              );
            })}
            {isOwnerOrAdmin && wo.status !== "cancelled" && (
              <>
                <div className="mx-1 h-4 w-px bg-border flex-shrink-0" />
                <button
                  onClick={() => handleStatusChange("cancelled")}
                  disabled={isPending}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:bg-red-50 hover:text-red-600 transition-colors flex-shrink-0"
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column — main content */}
        <div className="lg:col-span-2 space-y-6">

          {/* Instructions */}
          {wo.description && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Instructions</CardTitle></CardHeader>
              <CardContent className="pt-0">
                <p className="text-sm whitespace-pre-wrap">{wo.description}</p>
              </CardContent>
            </Card>
          )}

          {/* Progress updates timeline */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Progress Updates {updates.length > 0 && <span className="ml-1 text-muted-foreground/60">({updates.length})</span>}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <WorkOrderUpdatesTimeline
                workOrderId={wo.id}
                workOrderTitle={wo.title}
                propertyAddress={wo.property_address}
                initialUpdates={updates}
                userRole={userRole}
                currentUserEmail={currentUserEmail}
                canAddUpdate={isEditor && (isOwnerOrAdmin || isAssignedWorker || !wo.assigned_to_email)}
              />
            </CardContent>
          </Card>

          {/* Photos */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Site Photos {wo.photos.length > 0 && <span className="ml-1 text-muted-foreground/60">({wo.photos.length})</span>}
                </CardTitle>
                {canUploadPhotos && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingPhotos}
                  >
                    {uploadingPhotos ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
                    {uploadingPhotos ? "Uploading..." : "Add Photos"}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="hidden"
                onChange={(e) => handlePhotoFiles(e.target.files)}
              />

              {wo.photos.length === 0 ? (
                canUploadPhotos ? (
                  <div
                    className="border-2 border-dashed rounded-lg p-10 text-center cursor-pointer hover:border-primary/40 transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <ImagePlus className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm font-medium">Tap to add photos</p>
                    <p className="text-xs text-muted-foreground mt-1">Capture site conditions — AI will analyse them to generate a scope of work</p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">No photos uploaded yet</p>
                )
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {wo.photos.map((photo, i) => (
                    <div key={photo.id} className="relative group aspect-square">
                      <Image
                        src={photo.url}
                        alt={`Photo ${i + 1}`}
                        fill
                        className="object-cover rounded-lg border"
                        sizes="150px"
                      />
                      <span className="absolute bottom-1 left-1 text-[9px] bg-black/60 text-white rounded px-1">{i + 1}</span>
                      {canUploadPhotos && (
                        <button
                          className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-destructive-foreground rounded-full items-center justify-center hidden group-hover:flex"
                          onClick={() => handleRemovePhoto(photo.id)}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}
                  {canUploadPhotos && (
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="aspect-square rounded-lg border-2 border-dashed flex flex-col items-center justify-center text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors"
                    >
                      <ImagePlus className="w-5 h-5 mb-1" />
                      <span className="text-[10px]">Add more</span>
                    </button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Worker submit form */}
          {canSubmit && (
            <Card className="border-purple-200 bg-purple-50/40">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold uppercase tracking-wide text-purple-600">Submit Work Order</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-4">
                <div className="space-y-1.5">
                  <Label>Site notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Textarea
                    rows={4}
                    placeholder="Describe what you found on-site, any issues, materials used, or anything the office should know..."
                    value={workerNotes}
                    onChange={(e) => setWorkerNotes(e.target.value)}
                  />
                </div>
                <Button
                  onClick={handleSubmit}
                  disabled={isPending}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                >
                  {isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                  Submit to Office
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Worker notes (after submission) */}
          {wo.worker_notes && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Worker Notes</CardTitle></CardHeader>
              <CardContent className="pt-0">
                <p className="text-sm whitespace-pre-wrap">{wo.worker_notes}</p>
              </CardContent>
            </Card>
          )}

          {/* Scope of Work */}
          {(isOwnerOrAdmin || wo.status === "submitted" || wo.status === "reviewed" || wo.status === "completed") && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Scope of Work</CardTitle>
                  {isOwnerOrAdmin && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 border-purple-200 text-purple-700 hover:bg-purple-50"
                      onClick={handleAnalyzeWithAI}
                      disabled={analyzingAI || (!wo.photos.length && !wo.worker_notes)}
                    >
                      {analyzingAI ? (
                        <><Loader2 className="w-3.5 h-3.5 animate-spin" />Analysing...</>
                      ) : (
                        <><Sparkles className="w-3.5 h-3.5" />Analyse with AI</>
                      )}
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                <AnimatePresence mode="wait">
                  {analyzingAI && (
                    <motion.div
                      key="analyzing"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center gap-3 py-6 justify-center text-sm text-muted-foreground"
                    >
                      <Sparkles className="w-4 h-4 text-purple-500 animate-pulse" />
                      Claude is analysing site photos and notes...
                    </motion.div>
                  )}
                </AnimatePresence>
                {!analyzingAI && (
                  <>
                    <Textarea
                      rows={10}
                      placeholder={isOwnerOrAdmin
                        ? "Click 'Analyse with AI' to generate from photos and notes, or type manually..."
                        : "Scope of work will appear here once analysed."}
                      value={scopeOfWork}
                      onChange={(e) => setScopeOfWork(e.target.value)}
                      readOnly={!isOwnerOrAdmin}
                      className={!isOwnerOrAdmin ? "bg-muted/30" : ""}
                    />
                    {isOwnerOrAdmin && (
                      <div className="flex justify-end">
                        <Button size="sm" variant="outline" onClick={handleSaveScope} disabled={savingScope} className="gap-1.5">
                          {savingScope ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                          Save
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right column — details sidebar */}
        <div className="space-y-4">
          <Card>
            <CardContent className="p-5 space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Details</h3>
              <Separator />

              <DetailRow icon={<Hash className="w-3.5 h-3.5" />} label="Number" value={wo.number} />
              {wo.customers && (
                <DetailRow icon={<User className="w-3.5 h-3.5" />} label="Client" value={`${wo.customers.name}${wo.customers.company ? ` · ${wo.customers.company}` : ""}`} />
              )}
              {wo.property_address && (
                <div className="flex items-start gap-2.5">
                  <span className="text-muted-foreground mt-0.5 flex-shrink-0"><MapPin className="w-3.5 h-3.5" /></span>
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Address</p>
                    <AddressLink address={wo.property_address} className="text-sm" />
                  </div>
                </div>
              )}
              {(assignedProfile || wo.assigned_to_email) && (
                <DetailRow
                  icon={<User className="w-3.5 h-3.5" />}
                  label="Assigned to"
                  value={assignedProfile
                    ? `${assignedProfile.name}${assignedProfile.role_title ? ` · ${assignedProfile.role_title}` : ""}`
                    : (wo.assigned_to ?? wo.assigned_to_email ?? "")}
                />
              )}
              {wo.scheduled_date && (
                <DetailRow icon={<Calendar className="w-3.5 h-3.5" />} label="Scheduled" value={wo.scheduled_date} />
              )}
              <DetailRow
                icon={<Calendar className="w-3.5 h-3.5" />}
                label="Created"
                value={new Date(wo.created_at).toLocaleDateString()}
              />
            </CardContent>
          </Card>

          {/* Quick status change for admins/owners */}
          {isOwnerOrAdmin && (
            <Card>
              <CardContent className="p-5 space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Move Status</h3>
                <Select value={wo.status} onValueChange={(v) => handleStatusChange(v as WorkOrderStatus)} disabled={isPending}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[...PIPELINE, { value: "cancelled" as WorkOrderStatus, label: "Cancelled" }].map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="text-muted-foreground mt-0.5 flex-shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-sm break-words">{value}</p>
      </div>
    </div>
  );
}
