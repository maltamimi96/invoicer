import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function TenantsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireAdmin();
  const { q } = await searchParams;
  const admin = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (admin as any)
    .from("businesses")
    .select("id, name, email, created_at, currency, country")
    .order("created_at", { ascending: false })
    .limit(200);

  if (q && q.trim()) {
    query = query.or(`name.ilike.%${q}%,email.ilike.%${q}%`);
  }

  const { data: tenants } = await query;
  const rows = (tenants as Array<{
    id: string;
    name: string | null;
    email: string | null;
    created_at: string;
    currency: string | null;
    country: string | null;
  }>) ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Tenants</h1>
          <p className="text-sm text-neutral-500 mt-0.5">{rows.length} shown</p>
        </div>
        <form method="get" className="flex gap-2">
          <input
            type="text"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search name or email…"
            className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm w-64"
          />
          <button className="px-3 py-1.5 rounded-md bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-sm">
            Search
          </button>
        </form>
      </div>

      <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden bg-white dark:bg-neutral-900">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 dark:bg-neutral-800/50 text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Name</th>
              <th className="text-left px-4 py-2 font-medium">Email</th>
              <th className="text-left px-4 py-2 font-medium">Region</th>
              <th className="text-left px-4 py-2 font-medium">Created</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-neutral-500">
                  No tenants {q ? "match your search" : "yet"}.
                </td>
              </tr>
            ) : (
              rows.map((t) => (
                <tr key={t.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/30">
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/admin/tenants/${t.id}`}
                      className="font-medium hover:underline"
                    >
                      {t.name || "(unnamed)"}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-neutral-600 dark:text-neutral-400">
                    {t.email || "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 font-mono">
                      {t.country ?? "—"} · {t.currency ?? "—"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-neutral-500 text-xs tabular-nums">
                    {new Date(t.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Link
                      href={`/admin/tenants/${t.id}`}
                      className="text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
                    >
                      →
                    </Link>
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
