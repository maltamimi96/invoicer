"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { stopImpersonationAction } from "../actions";

export function StopImpersonationButton() {
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <button
      className="text-xs font-medium px-2.5 py-1 rounded bg-black/20 hover:bg-black/30 disabled:opacity-50"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await stopImpersonationAction();
          router.push("/admin");
          router.refresh();
        })
      }
    >
      {pending ? "Stopping…" : "Stop"}
    </button>
  );
}
