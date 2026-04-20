"use client";

import { useState, useRef } from "react";
import { Sparkles, Loader2, X, ImagePlus } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface AiImageAnalyzerProps {
  onResult: (text: string) => void;
}

interface PreviewImage {
  base64: string;
  mediaType: string;
  preview: string;
  name: string;
}

export function AiImageAnalyzer({ onResult }: AiImageAnalyzerProps) {
  const [images, setImages] = useState<PreviewImage[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        setImages((prev) => [
          ...prev,
          { base64: dataUrl.split(",")[1], mediaType: file.type, preview: dataUrl, name: file.name },
        ]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleGenerate = async () => {
    if (images.length === 0) {
      toast.error("Upload at least one image");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "describe_images",
          images: images.map(({ base64, mediaType }) => ({ base64, mediaType })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      onResult(data.result);
      toast.success("Scope generated from images");
      setImages([]);
    } catch {
      toast.error("Image analysis failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div
        className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:border-purple-400/60 transition-colors"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <ImagePlus className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">Click or drag site photos here</p>
      </div>

      {images.length > 0 && (
        <>
          <div className="flex flex-wrap gap-2">
            {images.map((img, i) => (
              <div key={i} className="relative group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.preview} alt={img.name} className="h-14 w-14 object-cover rounded border" />
                <button
                  type="button"
                  className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full w-4 h-4 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            ))}
          </div>

          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-full gap-1.5 border-purple-400/50 text-purple-500 hover:text-purple-600 hover:bg-purple-50/10"
            onClick={handleGenerate}
            disabled={loading}
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {loading ? "Analyzing images..." : `Generate scope from ${images.length} image${images.length > 1 ? "s" : ""}`}
          </Button>
        </>
      )}
    </div>
  );
}
