import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ImpersonationSession } from "@/lib/admin/impersonation";
import { StopImpersonationButton } from "./stop-impersonation-button";

export async function ImpersonationBanner({ session }: { session: ImpersonationSession }) {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: biz } = await (admin as any)
    .from("businesses")
    .select("name")
    .eq("id", session.target_business_id)
    .single();

  const remaining = Math.max(
    0,
    Math.floor((new Date(session.expires_at).getTime() - Date.now()) / 60000),
  );

  return (
    <div className="bg-amber-500 text-black text-sm">
      <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs px-1.5 py-0.5 bg-black/20 rounded">IMPERSONATING</span>
          <span className="font-medium">{biz?.name ?? session.target_business_id}</span>
          <span className="text-xs opacity-75">
            {session.read_only ? "read-only" : "write-enabled"} · {remaining}m left
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="text-xs underline">View as tenant</Link>
          <StopImpersonationButton />
        </div>
      </div>
    </div>
  );
}
