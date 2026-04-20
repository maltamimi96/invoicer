"use client";

import { useState } from "react";
import { Sparkles, Loader2 } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface AiAssistButtonProps {
  value: string;
  onResult: (text: string) => void;
}

export function AiAssistButton({ value, onResult }: AiAssistButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (!value?.trim()) {
      toast.error("Add some text first");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "cleanup_text", text: value }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");

      onResult(data.result);
      toast.success("Cleaned up with AI");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "AI cleanup failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-5 w-5 text-muted-foreground hover:text-purple-500 transition-colors"
      onClick={handleClick}
      disabled={loading}
      title="Clean up with AI"
    >
      {loading ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Sparkles className="h-3 w-3" />
      )}
    </Button>
  );
}
