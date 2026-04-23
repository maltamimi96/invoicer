import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

export default async function MetricsPage() {
  await requireAdmin();
  const admin = createAdminClient();

  const d7 = daysAgo(7);
  const d30 = daysAgo(30);

  const [
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { count: tenants },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { count: tenants7 },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { count: tenants30 },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { count: invoices },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { count: invoices7 },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { count: invoices30 },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { count: customers },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { count: leads },
  ] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any).from("businesses").select("*", { count: "exact", head: true }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any).from("businesses").select("*", { count: "exact", head: true }).gte("created_at", d7),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any).from("businesses").select("*", { count: "exact", head: true }).gte("created_at", d30),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any).from("invoices").select("*", { count: "exact", head: true }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any).from("invoices").select("*", { count: "exact", head: true }).gte("created_at", d7),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any).from("invoices").select("*", { count: "exact", head: true }).gte("created_at", d30),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any).from("customers").select("*", { count: "exact", head: true }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any).from("leads").select("*", { count: "exact", head: true }),
  ]);

  // Top tenants by invoice count
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: topInvoices } = await (admin as any)
    .from("invoices")
    .select("business_id")
    .limit(5000);

  const counts = new Map<string, number>();
  for (const r of (topInvoices as Array<{ business_id: string }>) ?? []) {
    counts.set(r.business_id, (counts.get(r.business_id) ?? 0) + 1);
  }
  const topIds = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: topBizs } = await (admin as any)
    .from("businesses")
    .select("id, name")
    .in(
      "id",
      topIds.map((x) => x[0]),
    );
  const nameById = new Map<string, string>();
  for (const b of (topBizs as Array<{ id: string; name: string }>) ?? []) {
    nameById.set(b.id, b.name);
  }

  const kpi = (label: string, value: number | string, sub?: string) => (
    <div className="p-4 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
      <div className="text-xs text-neutral-500 uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-semibold tabular-nums mt-1">{value}</div>
      {sub && <div className="text-xs text-neutral-500 mt-1">{sub}</div>}
    </div>
  );

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Metrics</h1>
        <p className="text-sm text-neutral-500 mt-0.5">Platform-wide activity.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {kpi("Total tenants", tenants ?? 0, `+${tenants7 ?? 0} in 7d · +${tenants30 ?? 0} in 30d`)}
        {kpi("Total invoices", invoices ?? 0, `+${invoices7 ?? 0} in 7d · +${invoices30 ?? 0} in 30d`)}
        {kpi("Total customers", customers ?? 0)}
        {kpi("Total leads", leads ?? 0)}
      </div>

      <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
        <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800">
          <h2 className="text-sm font-medium">Top tenants by invoice volume</h2>
        </div>
        <table className="w-full text-sm">
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {topIds.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-neutral-500">No data yet.</td>
              </tr>
            ) : (
              topIds.map(([id, n], i) => (
                <tr key={id}>
                  <td className="px-4 py-2.5 w-10 text-neutral-400 tabular-nums">{i + 1}</td>
                  <td className="px-4 py-2.5">
                    <a href={`/admin/tenants/${id}`} className="hover:underline font-medium">
                      {nameById.get(id) || id}
                    </a>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-neutral-500">{n}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
