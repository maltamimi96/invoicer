import Link from "next/link";
import { ChevronRight, ArrowLeft } from "@/components/ui/icons";

/**
 * Where you are, and how to get back out.
 *
 * Kirei goes three levels deep in several places — /prospects → hunts → a hunt
 * → its review queue — and had no consistent way back. Twenty-six files
 * hand-rolled their own ArrowLeft link, each deciding for itself what "back"
 * meant, and several deep pages had none at all: the only way out was the
 * browser button or the sidebar, which drops you at the top of a section
 * rather than where you were.
 *
 * The trail is passed explicitly rather than derived from the URL. A derived
 * one would render "/prospects/hunts/3ce6b0ba-8039-…" — the segment a route
 * needs is not the word a person recognises, and the page is the only thing
 * that knows a hunt is called "Chipping Norton — no website".
 *
 * On a phone it collapses to the immediate parent with a back arrow. A
 * three-level trail wraps to two lines on a 375px screen and stops being
 * navigation; one clear way back is worth more than a complete map.
 */

export interface Crumb {
  label: string;
  href: string;
}

export function Breadcrumbs({ trail }: { trail: Crumb[] }) {
  if (!trail.length) return null;
  const parent = trail[trail.length - 1];

  return (
    <nav aria-label="Breadcrumb" className="mb-2 min-w-0">
      {/* Phone: one unambiguous way back. */}
      <Link
        href={parent.href}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground sm:hidden"
      >
        <ArrowLeft className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{parent.label}</span>
      </Link>

      {/* Wider: the whole path, so you can jump two levels in one click. */}
      <ol className="hidden flex-wrap items-center gap-1 text-sm text-muted-foreground sm:flex">
        {trail.map((crumb, i) => (
          <li key={crumb.href} className="flex items-center gap-1 min-w-0">
            <Link
              href={crumb.href}
              className="truncate transition-colors hover:text-foreground hover:underline"
            >
              {crumb.label}
            </Link>
            {i < trail.length - 1 && (
              <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden />
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
