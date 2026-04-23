import Link from "next/link";
import { requireAdmin, getOperator } from "@/lib/admin/auth";
import { getActiveImpersonation } from "@/lib/admin/impersonation";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminSidebar } from "./_components/sidebar";
import { ImpersonationBanner } from "./_components/impersonation-banner";

export const metadata = {
  title: "Admin — Invoicer",
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Bootstrap escape hatch: if there are zero operators, let any logged-in
  // user reach /admin so they can self-promote. The bootstrap page itself
  // re-checks this invariant before inserting.
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count } = await (admin as any)
    .from("admin_operators")
    .select("*", { count: "exact", head: true });

  if ((count ?? 0) === 0) {
    const maybeOp = await getOperator();
    void maybeOp;
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100">
        {children}
      </div>
    );
  }

  const operator = await requireAdmin();
  const impersonation = await getActiveImpersonation();

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100">
      {impersonation && <ImpersonationBanner session={impersonation} />}
      <div className="flex">
        <AdminSidebar operator={operator} />
        <main className="flex-1 min-h-screen">
          <header className="h-14 border-b border-neutral-200 dark:border-neutral-800 px-6 flex items-center justify-between bg-white dark:bg-neutral-900">
            <div className="text-sm text-neutral-500">
              <Link href="/admin" className="hover:text-neutral-900 dark:hover:text-neutral-100">Admin</Link>
            </div>
            <div className="text-xs text-neutral-500">
              <span className="px-2 py-0.5 rounded-full bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 font-mono">
                {operator.role}
              </span>
              <span className="ml-3">{operator.display_name || operator.email}</span>
            </div>
          </header>
          <div className="p-6 max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
