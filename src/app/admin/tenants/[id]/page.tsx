import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin, canWrite } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { startImpersonationAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function TenantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const operator = await requireAdmin();
  const { id } = await params;
  const admin = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: biz } = await (admin as any)
    .from("businesses")
    .select("*")
    .eq("id", id)
    .single();

  if (!biz) notFound();

  const [
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { count: invoiceCount },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { count: customerCount },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { count: memberCount },
  ] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any).from("invoices").select("*", { count: "exact", head: true }).eq("business_id", id),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any).from("customers").select("*", { count: "exact", head: true }).eq("business_id", id),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any).from("business_members").select("*", { count: "exact", head: true }).eq("business_id", id),
  ]);

  const field = (label: string, value: React.ReactNode) => (
    <div className="flex justify-between py-2 border-b border-neutral-100 dark:border-neutral-800 last:border-0">
      <span className="text-xs text-neutral-500 uppercase tracking-wide">{label}</span>
      <span className="text-sm font-medium text-right">{value || "—"}</span>
    </div>
  );

  return (
    <div>
      <div className="mb-6">
        <Link href="/admin/tenants" className="text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">
          ← All tenants
        </Link>
        <h1 className="text-xl font-semibold mt-2">{biz.name || "(unnamed)"}</h1>
        <p className="text-xs font-mono text-neutral-500 mt-0.5">{biz.id}</p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="p-4 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
          <div className="text-xs text-neutral-500 uppercase">Invoices</div>
          <div className="text-2xl font-semibold tabular-nums">{invoiceCount ?? 0}</div>
        </div>
        <div className="p-4 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
          <div className="text-xs text-neutral-500 uppercase">Customers</div>
          <div className="text-2xl font-semibold tabular-nums">{customerCount ?? 0}</div>
        </div>
        <div className="p-4 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
          <div className="text-xs text-neutral-500 uppercase">Team members</div>
          <div className="text-2xl font-semibold tabular-nums">{memberCount ?? 0}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="p-5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
          <h2 className="text-sm font-medium mb-3">Business details</h2>
          {field("Email", biz.email)}
          {field("Phone", biz.phone)}
          {field("Address", [biz.address, biz.city, biz.postcode, biz.country].filter(Boolean).join(", "))}
          {field("Website", biz.website)}
          {field("Currency", biz.currency)}
          {field("Locale", biz.locale)}
          {field("Created", new Date(biz.created_at).toLocaleString())}
        </div>

        <div className="p-5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
          <h2 className="text-sm font-medium mb-3">Actions</h2>
          {canWrite(operator.role) ? (
            <form action={startImpersonationAction} className="space-y-3">
              <input type="hidden" name="business_id" value={biz.id} />
              <div>
                <label className="text-xs text-neutral-500 block mb-1">Reason (logged)</label>
                <input
                  name="reason"
                  placeholder="e.g. support ticket #123"
                  className="w-full px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2 px-4 rounded-md bg-amber-500 hover:bg-amber-400 text-black text-sm font-medium"
              >
                Impersonate (read-only, 30min)
              </button>
              <p className="text-xs text-neutral-500">
                You&apos;ll be redirected to the tenant&apos;s dashboard. Every action is audited.
              </p>
            </form>
          ) : (
            <p className="text-sm text-neutral-500">
              Your role ({operator.role}) cannot impersonate tenants.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
