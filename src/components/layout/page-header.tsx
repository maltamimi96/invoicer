import { Breadcrumbs, type Crumb } from "@/components/layout/breadcrumbs";
/**
 * Standard page header used across list / detail pages — Kirei design.
 *
 * Bigger 3xl title with tight tracking, soft subtitle, gradient accent
 * underline on the left rail. Actions slot pinned to the right.
 *
 * Server-component-safe (no hooks). The visual is plain Tailwind so it
 * works inside server components.
 */

interface Props {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  /**
   * Ancestors of this page, nearest last. The page's own title is not a crumb.
   * Passed explicitly because a URL segment is not the word a person
   * recognises — a hunt's crumb is its name, not its uuid.
   */
  trail?: Crumb[];
}

/**
 * The rail is the theme's primary, always.
 *
 * There was an `accent` prop taking a raw CSS gradient string, and 22 pages
 * passed one: quotes violet, leads blue, work orders amber, products emerald.
 * Two of them (`customers/new`, `automations`) were still passing
 * `#3a847e → #1f4f4a` — the teal of a palette that was retired and now exists
 * in no theme at all. A page's identity is its title, not a colour nobody
 * chose deliberately, and a CSS string can never respond to the five palettes.
 *
 * If per-section colour is ever genuinely wanted, it comes back as a token
 * enum resolved here — never as a string passed in from the page.
 */
export function PageHeader({ title, subtitle, actions, trail }: Props) {
  const accentBg = "linear-gradient(180deg, hsl(var(--primary)) 0%, hsl(var(--primary) / 0.6) 100%)";
  return (
    <div className="mb-6">
      {trail?.length ? <Breadcrumbs trail={trail} /> : null}
      <div className="flex items-end justify-between gap-3 flex-wrap">
      <div className="flex items-stretch gap-3 min-w-0">
        <div
          className="w-1 rounded-full shrink-0"
          style={{ backgroundImage: accentBg }}
          aria-hidden
        />
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight text-balance break-words">{title}</h1>
          {subtitle && (
            <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
          )}
        </div>
      </div>
        {actions && (
          <div className="flex items-center gap-2 flex-wrap">{actions}</div>
        )}
      </div>
    </div>
  );
}
