import { requireAdminRole } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  inviteOperatorAction,
  revokeOperatorAction,
  changeOperatorRoleAction,
} from "../actions";

export const dynamic = "force-dynamic";

const ROLES = ["superadmin", "billing", "support", "read_only"] as const;

export default async function OperatorsPage() {
  const me = await requireAdminRole(["superadmin"]);
  const admin = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: operators } = await (admin as any)
    .from("admin_operators")
    .select("id, user_id, role, display_name, created_at, last_seen_at")
    .order("created_at", { ascending: true });

  // Enrich with emails from auth.users
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: authResp } = await (admin as any).auth.admin.listUsers({ page: 1, perPage: 1000 });
  const emailByUser = new Map<string, string>();
  for (const u of authResp?.users ?? []) {
    if (u.id && u.email) emailByUser.set(u.id, u.email);
  }

  const rows =
    (operators as Array<{
      id: string;
      user_id: string;
      role: string;
      display_name: string | null;
      created_at: string;
      last_seen_at: string | null;
    }>) ?? [];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Operators</h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          People who can access this admin panel. You are <span className="font-mono">{me.role}</span>.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 dark:bg-neutral-800/50 text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Operator</th>
                <th className="text-left px-4 py-2 font-medium">Role</th>
                <th className="text-left px-4 py-2 font-medium">Last seen</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {rows.map((op) => {
                const email = emailByUser.get(op.user_id) ?? "(unknown)";
                const isSelf = op.id === me.id;
                return (
                  <tr key={op.id}>
                    <td className="px-4 py-3">
                      <div className="font-medium">{op.display_name || email}</div>
                      <div className="text-xs text-neutral-500">{email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <form action={changeOperatorRoleAction} className="flex gap-1">
                        <input type="hidden" name="operator_id" value={op.id} />
                        <select
                          name="role"
                          defaultValue={op.role}
                          disabled={isSelf}
                          className="text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 font-mono disabled:opacity-60"
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                        {!isSelf && (
                          <button className="text-xs px-2 py-1 rounded bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700">
                            Save
                          </button>
                        )}
                      </form>
                    </td>
                    <td className="px-4 py-3 text-xs text-neutral-500 tabular-nums">
                      {op.last_seen_at ? new Date(op.last_seen_at).toLocaleString() : "never"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isSelf ? (
                        <span className="text-xs text-neutral-400">you</span>
                      ) : (
                        <form action={revokeOperatorAction}>
                          <input type="hidden" name="operator_id" value={op.id} />
                          <button className="text-xs text-red-600 hover:text-red-700 dark:text-red-400">
                            Revoke
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5">
          <h2 className="text-sm font-medium mb-3">Invite operator</h2>
          <p className="text-xs text-neutral-500 mb-4">
            The user must already have an Invoicer account. They&apos;ll get admin access the next time they visit /admin.
          </p>
          <form action={inviteOperatorAction} className="space-y-3">
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Email</label>
              <input
                name="email"
                type="email"
                required
                className="w-full px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Display name (optional)</label>
              <input
                name="display_name"
                className="w-full px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Role</label>
              <select
                name="role"
                defaultValue="support"
                className="w-full px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm font-mono"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <button className="w-full py-2 rounded-md bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-sm font-medium">
              Invite
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
