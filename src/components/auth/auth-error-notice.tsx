"use client";

/**
 * Show the auth error the user actually hit, instead of swallowing it.
 *
 * Supabase reports failures TWO ways and we were reading neither:
 *
 *   ?error=access_denied&error_code=otp_expired…   (query — server can see it)
 *   #error=access_denied&error_code=otp_expired…   (fragment — server CANNOT)
 *
 * A fragment is never sent to the server, so `/auth/callback` had no way to
 * know why it failed and fell through to a flat "Could not authenticate".
 * Reading it on the client is the only way.
 *
 * The hash is cleared once read, so a refresh doesn't re-raise a stale error
 * and the token fragment doesn't sit in the address bar.
 */

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

/** Supabase's error codes, in words someone can act on. */
function humanise(code: string | null, description: string | null): string {
  switch (code) {
    case "otp_expired":
      return "That password reset link has expired. Reset links are single-use and time-limited — request a new one below.";
    case "access_denied":
      return "That link is no longer valid. It may have already been used, or expired. Request a new one below.";
    default:
      // Supabase's own description is usually decent; fall back to it before
      // inventing wording of our own.
      return description || "We couldn't complete that sign-in. Please try again.";
  }
}

export function AuthErrorNotice() {
  const params = useSearchParams();
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    // 1. Fragment — how Supabase reports a bad recovery link.
    const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
    if (hash) {
      const h = new URLSearchParams(hash);
      const err = h.get("error") ?? h.get("error_code");
      if (err) {
        setMessage(humanise(h.get("error_code") ?? h.get("error"), h.get("error_description")?.replace(/\+/g, " ") ?? null));
        // Drop it from the URL: a refresh shouldn't replay a stale failure.
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
        return;
      }
    }

    // 2. Query — our own callback, and some Supabase flows.
    const q = params.get("error");
    if (q) {
      setMessage(humanise(params.get("error_code"), params.get("error_description") ?? q));
    }
  }, [params]);

  if (!message) return null;

  return (
    <div
      role="alert"
      className="mb-5 rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-3 text-sm text-destructive"
    >
      {message}
    </div>
  );
}
