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
  /** Optional accent gradient — defaults to brand teal. Pass a custom CSS
   *  linear-gradient string (e.g. `linear-gradient(135deg, #fbbf24, #b45309)`)
   *  to tint the left rail with the page's domain colour. */
  accent?: string;
}

export function PageHeader({ title, subtitle, actions, accent }: Props) {
  const accentBg = accent ?? "linear-gradient(180deg, hsl(var(--primary)) 0%, hsl(var(--primary) / 0.6) 100%)";
  return (
    <div className="flex items-end justify-between gap-3 flex-wrap mb-6">
      <div className="flex items-stretch gap-3 min-w-0">
        <div
          className="w-1 rounded-full shrink-0"
          style={{ backgroundImage: accentBg }}
          aria-hidden
        />
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold tracking-tight truncate">{title}</h1>
          {subtitle && (
            <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex items-center gap-2 flex-wrap">{actions}</div>
      )}
    </div>
  );
}
