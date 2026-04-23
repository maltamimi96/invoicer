"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Operator } from "@/lib/admin/roles";
import { canManageOperators } from "@/lib/admin/roles";

const NAV: { href: string; label: string; superadminOnly?: boolean }[] = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/tenants", label: "Tenants" },
  { href: "/admin/metrics", label: "Metrics" },
  { href: "/admin/audit", label: "Audit log" },
  { href: "/admin/operators", label: "Operators", superadminOnly: true },
];

export function AdminSidebar({ operator }: { operator: Operator }) {
  const pathname = usePathname();

  const items = NAV.filter(
    (n) => !n.superadminOnly || canManageOperators(operator.role),
  );

  return (
    <aside className="w-56 shrink-0 border-r border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 min-h-screen">
      <div className="h-14 px-5 flex items-center border-b border-neutral-200 dark:border-neutral-800">
        <span className="font-semibold text-sm tracking-tight">Invoicer Admin</span>
      </div>
      <nav className="py-3 px-2 space-y-0.5">
        {items.map((n) => {
          const active = n.href === "/admin" ? pathname === "/admin" : pathname.startsWith(n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`block px-3 py-2 rounded-md text-sm transition-colors ${
                active
                  ? "bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 font-medium"
                  : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 hover:text-neutral-900 dark:hover:text-neutral-100"
              }`}
            >
              {n.label}
            </Link>
          );
        })}
      </nav>
      <div className="absolute bottom-0 w-56 border-t border-neutral-200 dark:border-neutral-800 px-3 py-3">
        <Link
          href="/dashboard"
          className="block text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 px-2"
        >
          ← Back to app
        </Link>
      </div>
    </aside>
  );
}
