import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: any, n: string) => sb.from(n);

export default async function UnsubscribePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sb = createAdminClient();

  let done = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: p } = await tbl(sb, "prospects").select("id, business_id, email").eq("unsub_token", token).maybeSingle();
  if (p?.email) {
    // Idempotent guarded insert (unique index is on lower(email)).
    const { data: exists } = await tbl(sb, "prospect_suppressions").select("id").eq("business_id", p.business_id).ilike("email", p.email).maybeSingle();
    if (!exists) {
      await tbl(sb, "prospect_suppressions").insert({ business_id: p.business_id, email: p.email, reason: "unsubscribe" });
      await tbl(sb, "prospect_activities").insert({ business_id: p.business_id, prospect_id: p.id, type: "unsubscribe", summary: "Unsubscribed from outreach" });
    }
    done = true;
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-b from-white to-slate-50">
      <div className="max-w-sm text-center">
        <h1 className="text-xl font-bold text-slate-900">{done ? "You've been unsubscribed" : "Link not found"}</h1>
        <p className="text-sm text-slate-500 mt-2">
          {done ? "You won't receive any more emails from us. Sorry to see you go." : "This unsubscribe link is invalid or expired."}
        </p>
      </div>
    </div>
  );
}
