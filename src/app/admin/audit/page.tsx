import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; operator?: string }>;
}) {
  await requireAdmin();
  const { action, operator } = await searchParams;
  const admin = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (admin as any)
    .from("admin_audit_log")
    .select("id, operator_user_id, action, target_type, target_id, target_business_id, metadata, ip_address, created_at")
    .order("created_at", { ascending: false })
    .limit(300);

  if (action) q = q.eq("action", action);
  if (operator) q = q.eq("operator_user_id", operator);

  const { data } = await q;
  const rows =
    (data as Array<{
      id: number;
      operator_user_id: string;
      action: string;
      target_type: string | null;
      target_id: string | null;
      target_business_id: string | null;
      metadata: Record<string, unknown> | null;
      ip_address: string | null;
      created_at: string;
    }>) ?? [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: authResp } = await (admin as any).auth.admin.listUsers({ page: 1, perPage: 1000 });
  const emailByUser = new Map<string, string>();
  for (const u of authResp?.users ?? []) {
    if (u.id && u.email) emailByUser.set(u.id, u.email);
  }

  const distinctActions = [...new Set(rows.map((r) => r.action))].sort();

  return (
    <div>
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold">Audit log</h1>
          <p className="text-sm text-neutral-500 mt-0.5">
            {rows.length} events (most recent 300)
          </p>
        </div>
        <form method="get" className="flex gap-2">
          <select
            name="action"
            defaultValue={action ?? ""}
            className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm font-mono"
          >
            <option value="">All actions</option>
            {distinctActions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <button className="px-3 py-1.5 rounded-md bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-sm">
            Filter
          </button>
        </form>
      </div>

      <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden bg-white dark:bg-neutral-900">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 dark:bg-neutral-800/50 text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="text-left px-4 py-2 font-medium">When</th>
              <th className="text-left px-4 py-2 font-medium">Operator</th>
              <th className="text-left px-4 py-2 font-medium">Action</th>
              <th className="text-left px-4 py-2 font-medium">Target</th>
              <th className="text-left px-4 py-2 font-medium">IP</th>
              <th className="text-left px-4 py-2 font-medium">Metadata</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-neutral-500">
                  No audit events.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="px-4 py-2 text-xs text-neutral-500 tabular-nums whitespace-nowrap">
                    {new Date(r.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {emailByUser.get(r.operator_user_id) ?? (
                      <span className="font-mono text-neutral-500">
                        {r.operator_user_id.slice(0, 8)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800">
                      {r.action}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-neutral-600 dark:text-neutral-400">
                    {r.target_type ? (
                      <>
                        <span className="text-neutral-400">{r.target_type}</span>
                        {r.target_id && (
                          <span className="font-mono ml-1">{r.target_id.slice(0, 8)}</span>
                        )}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs text-neutral-500 font-mono">
                    {r.ip_address ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-xs text-neutral-500 font-mono max-w-xs truncate">
                    {r.metadata ? JSON.stringify(r.metadata) : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
