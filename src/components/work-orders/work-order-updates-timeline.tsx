"use client";

import { useState, useRef, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ImagePlus, Send, Loader2, Trash2, Sparkles, X,
  CheckCircle, Clock,
} from "lucide-react";
import { toast } from "sonner";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { addWorkOrderUpdate, deleteWorkOrderUpdate } from "@/lib/actions/work-order-updates";
import { createClient } from "@/lib/supabase/client";
import { canManageTeam, type Role } from "@/lib/permissions";
import type { WorkOrderUpdate, WorkOrderUpdatePhoto } from "@/types/database";
import { PhotoOrganizerModal } from "./photo-organizer-modal";

// ── Phase styles ──────────────────────────────────────────────────────────────

const PHASE_STYLES = {
  before:   "bg-rose-100 text-rose-700 border-rose-200",
  progress: "bg-amber-100 text-amber-700 border-amber-200",
  after:    "bg-green-100 text-green-700 border-green-200",
};

const PHASE_LABELS = { before: "Before", progress: "Progress", after: "After" };

// ── Avatar initials ───────────────────────────────────────────────────────────

function AuthorAvatar({ name }: { name: string }) {
  const initials = name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  return (
    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-violet-600 text-white flex items-center justify-center text-xs font-semibold flex-shrink-0">
      {initials}
    </div>
  );
}

// ── Single update card ────────────────────────────────────────────────────────

function UpdateCard({
  update,
  canDelete,
  onDeleted,
}: {
  update: WorkOrderUpdate;
  canDelete: boolean;
  onDeleted: (id: string) => void;
}) {
  const grouped = {
    before:   update.photos.filter((p) => p.phase === "before"),
    progress: update.photos.filter((p) => p.phase === "progress"),
    after:    update.photos.filter((p) => p.phase === "after"),
  };

  const hasPhotos = update.photos.length > 0;

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <AuthorAvatar name={update.author_name || update.author_email} />
        <div className="w-px flex-1 bg-border mt-2" />
      </div>
      <div className="flex-1 min-w-0 pb-6">
        <div className="flex items-center gap-2 mb-2">
          <p className="text-sm font-medium">{update.author_name || update.author_email}</p>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {new Date(update.created_at).toLocaleString("en-AU", {
              month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
            })}
          </span>
          {canDelete && (
            <button
              className="ml-auto text-muted-foreground hover:text-destructive transition-colors"
              onClick={async () => {
                if (!confirm("Delete this update?")) return;
                try {
                  await deleteWorkOrderUpdate(update.id);
                  onDeleted(update.id);
                  toast.success("Update deleted");
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Failed to delete");
                }
              }}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {update.content && (
          <p className="text-sm whitespace-pre-wrap mb-3 leading-relaxed">{update.content}</p>
        )}

        {hasPhotos && (
          <div className="space-y-3">
            {(["before", "progress", "after"] as const).map((phase) => {
              const photos = grouped[phase];
              if (!photos.length) return null;
              return (
                <div key={phase}>
                  <Badge variant="outline" className={`text-xs mb-1.5 ${PHASE_STYLES[phase]}`}>
                    {PHASE_LABELS[phase]} — {photos.length} photo{photos.length > 1 ? "s" : ""}
                  </Badge>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                    {photos.map((photo, i) => (
                      <div key={photo.id} className="relative aspect-square group">
                        <Image
                          src={photo.url}
                          alt={photo.caption || `${PHASE_LABELS[phase]} ${i + 1}`}
                          fill
                          className="object-cover rounded-lg border"
                          sizes="120px"
                        />
                        {photo.caption && (
                          <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[9px] p-1 rounded-b-lg opacity-0 group-hover:opacity-100 transition-opacity line-clamp-2">
                            {photo.caption}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Add update form ───────────────────────────────────────────────────────────

interface PendingPhoto extends WorkOrderUpdatePhoto {
  preview: string;
  file?: File;
  uploading?: boolean;
}

function AddUpdateForm({
  workOrderId,
  workOrderTitle,
  propertyAddress,
  onAdded,
}: {
  workOrderId: string;
  workOrderTitle: string;
  propertyAddress: string | null;
  onAdded: (update: WorkOrderUpdate) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [content, setContent] = useState("");
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [organizing, setOrganizing] = useState(false);
  const [showOrganizer, setShowOrganizer] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const newPhotos: PendingPhoto[] = [...pendingPhotos];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.type.startsWith("image/")) continue;

        const ext = file.name.split(".").pop() ?? "jpg";
        const storagePath = `${user.id}/${workOrderId}/${crypto.randomUUID()}.${ext}`;

        const { error } = await supabase.storage
          .from("work-order-photos")
          .upload(storagePath, file, { contentType: file.type });
        if (error) { toast.error(`Failed to upload ${file.name}`); continue; }

        const { data: { publicUrl } } = supabase.storage.from("work-order-photos").getPublicUrl(storagePath);
        const preview = URL.createObjectURL(file);

        newPhotos.push({
          id: crypto.randomUUID(),
          url: publicUrl,
          storagePath,
          phase: "progress",
          caption: "",
          order: newPhotos.length + 1,
          preview,
          file,
        });
      }
      setPendingPhotos(newPhotos);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removePhoto = (id: string) => {
    setPendingPhotos((prev) => prev.filter((p) => p.id !== id));
  };

  const setPhase = (id: string, phase: WorkOrderUpdatePhoto["phase"]) => {
    setPendingPhotos((prev) => prev.map((p) => p.id === id ? { ...p, phase } : p));
  };

  const handleOrganizerConfirm = (organized: WorkOrderUpdatePhoto[]) => {
    const map = new Map(organized.map((o) => [o.id, o]));
    setPendingPhotos((prev) =>
      prev
        .filter((p) => !(map.get(p.id) as (WorkOrderUpdatePhoto & { isDuplicate?: boolean }) | undefined)?.isDuplicate)
        .map((p) => {
          const o = map.get(p.id);
          return o ? { ...p, phase: o.phase, caption: o.caption } : p;
        })
    );
    setShowOrganizer(false);
    const dupes = organized.filter((o) => (o as WorkOrderUpdatePhoto & { isDuplicate?: boolean }).isDuplicate).length;
    toast.success(`Photos organised${dupes ? ` — ${dupes} duplicate${dupes > 1 ? "s" : ""} removed` : ""}`);
  };

  const handleSubmit = () => {
    if (!content.trim() && pendingPhotos.length === 0) {
      toast.error("Add a note or photo before submitting");
      return;
    }

    const photos: WorkOrderUpdatePhoto[] = pendingPhotos.map(({ preview: _, file: __, uploading: ___, ...p }) => p);

    startTransition(async () => {
      try {
        const update = await addWorkOrderUpdate(workOrderId, { content, photos });
        onAdded(update);
        setContent("");
        setPendingPhotos([]);
        toast.success("Update posted");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to post update");
      }
    });
  };

  return (
    <>
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Add update</p>

        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="What did you do? Any issues, materials used, observations..."
          rows={3}
          className="resize-none"
        />

        {/* Pending photos */}
        {pendingPhotos.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{pendingPhotos.length} photo{pendingPhotos.length > 1 ? "s" : ""} — tap to tag phase</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs h-7 border-purple-200 text-purple-700 hover:bg-purple-50"
                onClick={() => setShowOrganizer(true)}
                disabled={organizing}
              >
                {organizing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                Organise with AI
              </Button>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {pendingPhotos.map((photo) => (
                <div key={photo.id} className="space-y-1">
                  <div className="relative aspect-square">
                    <Image src={photo.preview || photo.url} alt="" fill className="object-cover rounded-lg border" sizes="100px" />
                    <button
                      className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center"
                      onClick={() => removePhoto(photo.id)}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="flex gap-0.5">
                    {(["before", "progress", "after"] as const).map((phase) => (
                      <button
                        key={phase}
                        onClick={() => setPhase(photo.id, phase)}
                        className={`flex-1 text-[9px] py-0.5 rounded border transition-colors ${
                          photo.phase === phase
                            ? PHASE_STYLES[phase]
                            : "bg-muted/30 text-muted-foreground border-transparent hover:border-border"
                        }`}
                      >
                        {phase === "before" ? "B4" : phase === "progress" ? "Prog" : "After"}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
            {uploading ? "Uploading..." : "Add photos"}
          </Button>
          <Button
            type="button"
            size="sm"
            className="gap-1.5 ml-auto"
            onClick={handleSubmit}
            disabled={isPending || uploading || (!content.trim() && pendingPhotos.length === 0)}
          >
            {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            Post update
          </Button>
        </div>
      </div>

      {showOrganizer && (
        <PhotoOrganizerModal
          photos={pendingPhotos.map(({ preview: _, file: __, uploading: ___, ...p }) => p)}
          jobTitle={workOrderTitle}
          jobAddress={propertyAddress ?? undefined}
          onConfirm={handleOrganizerConfirm}
          onClose={() => setShowOrganizer(false)}
        />
      )}
    </>
  );
}

// ── Main timeline component ───────────────────────────────────────────────────

interface WorkOrderUpdatesTimelineProps {
  workOrderId: string;
  workOrderTitle: string;
  propertyAddress: string | null;
  initialUpdates: WorkOrderUpdate[];
  userRole: Role;
  currentUserEmail: string;
  canAddUpdate: boolean;
}

export function WorkOrderUpdatesTimeline({
  workOrderId,
  workOrderTitle,
  propertyAddress,
  initialUpdates,
  userRole,
  canAddUpdate,
}: WorkOrderUpdatesTimelineProps) {
  const [updates, setUpdates] = useState(initialUpdates);
  const canDelete = canManageTeam(userRole);

  const handleAdded = (update: WorkOrderUpdate) => {
    setUpdates((prev) => [...prev, update]);
  };

  const handleDeleted = (id: string) => {
    setUpdates((prev) => prev.filter((u) => u.id !== id));
  };

  return (
    <div className="space-y-4">
      {updates.length === 0 && !canAddUpdate && (
        <p className="text-sm text-muted-foreground text-center py-6">No updates yet</p>
      )}

      {/* Timeline entries */}
      {updates.length > 0 && (
        <div className="relative">
          <AnimatePresence>
            {updates.map((update) => (
              <motion.div
                key={update.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <UpdateCard
                  update={update}
                  canDelete={canDelete}
                  onDeleted={handleDeleted}
                />
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Final tick mark */}
          {updates.length > 0 && (
            <div className="flex gap-3 items-center">
              <div className="w-8 flex items-center justify-center">
                <CheckCircle className="w-4 h-4 text-muted-foreground/40" />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add update form */}
      {canAddUpdate && (
        <AddUpdateForm
          workOrderId={workOrderId}
          workOrderTitle={workOrderTitle}
          propertyAddress={propertyAddress}
          onAdded={handleAdded}
        />
      )}
    </div>
  );
}
