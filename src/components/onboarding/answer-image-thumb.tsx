"use client";

/**
 * Inline preview for an image answer on the business side. Resolves a
 * short-lived signed URL for the private onboarding-uploads bucket on mount;
 * click opens the full-size image in a new tab.
 */

import { useEffect, useState } from "react";
import { Loader2, ImageIcon } from "@/components/ui/icons";
import { getOnboardingUploadUrl } from "@/lib/actions/onboarding";

export function AnswerImageThumb({ path, name, size = "md" }: {
  path: string;
  name?: string | null;
  /** md = viewer (larger), sm = compact profile card */
  size?: "sm" | "md";
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    getOnboardingUploadUrl(path)
      .then((u) => { if (alive) { if (u) setUrl(u); else setFailed(true); } })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [path]);

  const box = size === "sm" ? "h-16 w-16" : "h-32 w-32";

  if (failed) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
        <ImageIcon className="w-4 h-4" /> {name ?? "Image unavailable"}
      </span>
    );
  }
  if (!url) {
    return (
      <span className={`${box} rounded-lg border border-border bg-muted/40 inline-flex items-center justify-center`}>
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </span>
    );
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" title={name ?? "Open full size"} className="inline-block">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={name ?? "Uploaded image"}
        className={`${box} rounded-lg border border-border object-cover hover:opacity-90 transition-opacity`}
      />
    </a>
  );
}
