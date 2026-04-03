"use client";

import { useState, useEffect } from "react";
import { Sparkles, Loader2, CheckCircle, AlertTriangle, X } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { WorkOrderUpdatePhoto } from "@/types/database";

interface OrganizerPhoto extends WorkOrderUpdatePhoto {
  isDuplicate?: boolean;
  aiSuggested?: boolean;
}

const PHASE_STYLES = {
  before:   "bg-rose-100 text-rose-700 border-rose-200 hover:bg-rose-200",
  progress: "bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-200",
  after:    "bg-green-100 text-green-700 border-green-200 hover:bg-green-200",
};

interface PhotoOrganizerModalProps {
  photos: WorkOrderUpdatePhoto[];
  jobTitle: string;
  jobAddress?: string;
  onConfirm: (photos: (WorkOrderUpdatePhoto & { isDuplicate?: boolean })[]) => void;
  onClose: () => void;
}

export function PhotoOrganizerModal({
  photos: inputPhotos,
  jobTitle,
  jobAddress,
  onConfirm,
  onClose,
}: PhotoOrganizerModalProps) {
  const [photos, setPhotos] = useState<OrganizerPhoto[]>(inputPhotos.map((p) => ({ ...p, isDuplicate: false })));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    organise();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const organise = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "organize_photos",
          photos: inputPhotos.map((p) => ({ id: p.id, url: p.url })),
          jobTitle,
          jobAddress,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "AI analysis failed");

      const suggestions = data.result as Array<{
        id: string; phase: string; caption: string; isDuplicate: boolean;
      }>;

      const map = new Map(suggestions.map((s) => [s.id, s]));
      setPhotos(inputPhotos.map((p) => {
        const s = map.get(p.id);
        return {
          ...p,
          phase: (s?.phase as WorkOrderUpdatePhoto["phase"]) ?? p.phase,
          caption: s?.caption ?? p.caption,
          isDuplicate: s?.isDuplicate ?? false,
          aiSuggested: !!s,
        };
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI analysis failed");
      // Keep original photos on error
      setPhotos(inputPhotos.map((p) => ({ ...p, isDuplicate: false })));
    } finally {
      setLoading(false);
    }
  };

  const togglePhase = (id: string, phase: WorkOrderUpdatePhoto["phase"]) => {
    setPhotos((prev) => prev.map((p) => p.id === id ? { ...p, phase } : p));
  };

  const toggleDuplicate = (id: string) => {
    setPhotos((prev) => prev.map((p) => p.id === id ? { ...p, isDuplicate: !p.isDuplicate } : p));
  };

  const duplicateCount = photos.filter((p) => p.isDuplicate).length;
  const keepCount = photos.length - duplicateCount;

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-500" />
            AI Photo Organiser
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 min-h-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
              <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
              <p className="text-sm">Claude is analysing your photos...</p>
              <p className="text-xs">Classifying before/progress/after and checking for duplicates</p>
            </div>
          ) : (
            <>
              {error && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  {error} — you can still adjust phases manually below.
                </div>
              )}

              <div className="flex items-center gap-3 text-sm">
                <p className="text-muted-foreground flex-1">
                  {loading ? "Analysing..." : `${keepCount} photo${keepCount !== 1 ? "s" : ""} to keep${duplicateCount > 0 ? `, ${duplicateCount} marked as duplicate` : ""}`}
                </p>
                {!loading && !error && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <CheckCircle className="w-3 h-3 text-green-500" />
                    AI suggestions applied — adjust as needed
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {photos.map((photo) => (
                  <div
                    key={photo.id}
                    className={`rounded-xl border overflow-hidden transition-opacity ${photo.isDuplicate ? "opacity-40" : ""}`}
                  >
                    <div className="relative aspect-video">
                      <Image src={photo.url} alt="" fill className="object-cover" sizes="200px" />
                      {photo.isDuplicate && (
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                          <Badge variant="destructive" className="text-xs">Duplicate</Badge>
                        </div>
                      )}
                    </div>
                    <div className="p-2 space-y-1.5">
                      {photo.caption && (
                        <p className="text-[10px] text-muted-foreground line-clamp-2">{photo.caption}</p>
                      )}
                      {/* Phase selector */}
                      <div className="flex gap-1">
                        {(["before", "progress", "after"] as const).map((phase) => (
                          <button
                            key={phase}
                            onClick={() => togglePhase(photo.id, phase)}
                            className={`flex-1 text-[10px] py-0.5 rounded border transition-colors ${
                              photo.phase === phase ? PHASE_STYLES[phase] : "bg-transparent text-muted-foreground border-border hover:bg-muted"
                            }`}
                          >
                            {phase === "before" ? "B4" : phase === "progress" ? "Prog" : "After"}
                          </button>
                        ))}
                      </div>
                      {/* Duplicate toggle */}
                      <button
                        onClick={() => toggleDuplicate(photo.id)}
                        className={`w-full text-[10px] py-0.5 rounded border transition-colors ${
                          photo.isDuplicate
                            ? "bg-destructive/10 text-destructive border-destructive/30"
                            : "text-muted-foreground border-border hover:bg-muted"
                        }`}
                      >
                        {photo.isDuplicate ? (
                          <span className="flex items-center justify-center gap-1">
                            <X className="w-2.5 h-2.5" /> Keep anyway
                          </span>
                        ) : "Mark as duplicate"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-between pt-3 border-t flex-shrink-0">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => onConfirm(photos)}
            disabled={loading}
          >
            <CheckCircle className="w-3.5 h-3.5" />
            Apply — keep {keepCount} photo{keepCount !== 1 ? "s" : ""}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
