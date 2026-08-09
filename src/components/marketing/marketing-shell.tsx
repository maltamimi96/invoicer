import Link from "next/link";
import { KireiWordmark } from "@/components/brand/kirei-logo";
import { SOLUTIONS } from "@/lib/marketing/solutions";

/**
 * The public site's chrome.
 *
 * Server component on purpose: these pages are the first thing a stranger
 * loads and they need no interactivity, so none of this ships as JavaScript.
 *
 * It reuses the app's theme tokens rather than inventing a second palette —
 * the marketing site and the product should not look like different companies.
 */
export function MarketingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen bg-background text-foreground">
      {/* The same two accent glows the app uses, so the seam between site and
          product is as small as possible. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-48 h-[560px] w-[560px] rounded-full blur-[100px]"
             style={{ background: "var(--glow)" }} />
        <div className="absolute right-[-10rem] top-[40rem] h-[480px] w-[480px] rounded-full blur-[110px]"
             style={{ background: "var(--glow)" }} />
      </div>

      <header className="relative mx-auto flex h-20 max-w-6xl items-center gap-6 px-5">
        <Link href="/" aria-label="Kirei home">
          <KireiWordmark className="h-7 w-auto" />
        </Link>
        <nav className="ml-auto flex items-center gap-1 sm:gap-4">
          {SOLUTIONS.map((s) => (
            <Link key={s.slug} href={`/${s.slug}`}
              className="hidden rounded-2xl px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground sm:block">
              {s.id === "trades" ? "For trades" : "For agencies"}
            </Link>
          ))}
          <Link href="/pricing"
            className="rounded-2xl px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
            Pricing
          </Link>
          <Link href="/auth/login"
            className="rounded-2xl px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
            Sign in
          </Link>
        </nav>
      </header>

      <main className="relative mx-auto max-w-6xl px-5 pb-24">{children}</main>

      <footer className="relative border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-10 sm:flex-row sm:items-start">
          <div className="sm:w-64">
            <KireiWordmark className="h-6 w-auto" />
            <p className="mt-3 text-sm text-muted-foreground">
              Software for trade businesses, and the agencies that run them.
            </p>
          </div>
          <div className="grid flex-1 grid-cols-2 gap-6 text-sm sm:grid-cols-3">
            <FooterCol title="Solutions" links={SOLUTIONS.map((s) => ({ href: `/${s.slug}`, label: s.name }))} />
            <FooterCol title="Company" links={[
              { href: "/pricing", label: "Pricing" },
              { href: "/contact-sales", label: "Contact sales" },
              { href: "/support", label: "Support" },
            ]} />
            <FooterCol title="Legal" links={[{ href: "/privacy", label: "Privacy" }]} />
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-5 pb-8 text-xs text-muted-foreground">
          © {new Date().getFullYear()} Kirei
        </div>
      </footer>
    </div>
  );
}

function FooterCol({ title, links }: { title: string; links: Array<{ href: string; label: string }> }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
      <ul className="mt-3 space-y-2">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="text-muted-foreground transition-colors hover:text-foreground">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
