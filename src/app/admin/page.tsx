import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOperator } from "@/lib/admin/auth";
import { bootstrapFirstOperatorAction } from "./actions";

export const dynamic = "force-dynamic";

async function BootstrapCard({ email }: { email: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md w-full border border-neutral-200 dark:border-neutral-800 rounded-xl bg-white dark:bg-neutral-900 p-8 shadow-sm">
        <div className="text-xs uppercase tracking-wide font-mono text-amber-600 dark:text-amber-400 mb-2">
          Admin bootstrap
        </div>
        <h1 className="text-xl font-semibold mb-3">Create the first operator</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-6">
          No admin operators exist yet. You&apos;re signed in as{" "}
          <span className="font-medium text-neutral-900 dark:text-neutral-100">{email}</span>.
          Promote yourself to the first <span className="font-mono text-xs">superadmin</span> to
          continue. This can only be done once.
        </p>
        <form action={bootstrapFirstOperatorAction}>
          <button
            type="submit"
            className="w-full py-2 px-4 rounded-md bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100"
          >
            Promote me to superadmin
          </button>
        </form>
      </div>
    </div>
  );
}

export default async function AdminHomePage() {
  const admin = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count: operatorCount } = await (admin as any)
    .from("admin_operators")
    .select("*", { count: "exact", head: true });

  if ((operatorCount ?? 0) === 0) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/auth/login?next=/admin");
    return <BootstrapCard email={user.email ?? ""} />;
  }

  const operator = await getOperator();
  if (!operator) redirect("/dashboard");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [{ count: tenantCount }, { count: userCount }, { count: invoiceCount }, recentAudit] =
    await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (admin as any).from("businesses").select("*", { count: "exact", head: true }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (admin as any).from("business_members").select("*", { count: "exact", head: true }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (admin as any).from("invoices").select("*", { count: "exact", head: true }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (admin as any)
        .from("admin_audit_log")
        .select("id, action, target_type, created_at, operator_user_id")
        .order("created_at", { ascending: false })
        .limit(8),
    ]);

  const stats = [
    { label: "Tenants", value: tenantCount ?? 0, href: "/admin/tenants" },
    { label: "Users", value: userCount ?? 0, href: "/admin/tenants" },
    { label: "Invoices", value: invoiceCount ?? 0, href: "/admin/metrics" },
    { label: "Operators", value: operatorCount ?? 0, href: "/admin/operators" },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Overview</h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          Welcome back, {operator.display_name || operator.email}.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {stats.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className="block p-4 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:border-neutral-300 dark:hover:border-neutral-700 transition-colors"
          >
            <div className="text-xs text-neutral-500 uppercase tracking-wide">{s.label}</div>
            <div className="text-2xl font-semibold mt-1 tabular-nums">{s.value}</div>
          </Link>
        ))}
      </div>

      <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
        <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
          <h2 className="text-sm font-medium">Recent admin activity</h2>
          <Link href="/admin/audit" className="text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">
            View all →
          </Link>
        </div>
        <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
          {((recentAudit?.data as Array<{ id: number; action: string; target_type: string | null; created_at: string }>) ?? []).length === 0 ? (
            <div className="px-4 py-6 text-sm text-neutral-500">No activity yet.</div>
          ) : (
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ((recentAudit?.data as any[]) ?? []).map((row: { id: number; action: string; target_type: string | null; created_at: string }) => (
              <div key={row.id} className="px-4 py-2.5 text-sm flex items-center justify-between">
                <div>
                  <span className="font-mono text-xs text-neutral-500">{row.action}</span>
                  {row.target_type && (
                    <span className="ml-2 text-xs text-neutral-400">{row.target_type}</span>
                  )}
                </div>
                <div className="text-xs text-neutral-500">
                  {new Date(row.created_at).toLocaleString()}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
