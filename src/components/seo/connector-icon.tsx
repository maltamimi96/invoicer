"use client";

/**
 * Brand marks for the SEO connectors.
 *
 * Resolves ConnectorDef.icon (a string, so the registry stays a plain module
 * importable by server actions) → a component. Same shape as the plugin store's
 * ICON_MAP (src/components/agents/agents-store.tsx).
 *
 * Phosphor only ships GitHub + Google logos, so WordPress / Sanity / Payload are
 * inline single-path SVGs. That's deliberate: pulling a whole brand-icon package
 * in for three glyphs would cost more than the bundle budget should pay. Paths
 * are the vendors' own marks, used to identify the integration.
 */
import { GithubLogo, GoogleLogo, CodeIcon, Graph, Plug } from "@/components/ui/icons";

type IconProps = { className?: string };

function WordpressMark({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 1.2a8.8 8.8 0 0 1 3.96.94h-.28c-.72 0-1.23.63-1.23 1.3 0 .61.35 1.12.72 1.73.28.49.6 1.12.6 2.03 0 .63-.24 1.36-.56 2.38l-.74 2.46-2.66-7.92c.44-.02.84-.07.84-.07.4-.05.35-.63-.04-.61 0 0-1.19.09-1.96.09-.72 0-1.93-.09-1.93-.09-.4-.02-.44.58-.05.61 0 0 .37.05.77.07l1.15 3.14-1.61 4.83-2.69-7.97c.44-.02.84-.07.84-.07.4-.05.35-.63-.04-.61 0 0-1.19.09-1.96.09-.14 0-.3 0-.47-.01A8.79 8.79 0 0 1 12 3.2ZM3.2 12c0-1.28.27-2.49.77-3.58l4.22 11.56A8.8 8.8 0 0 1 3.2 12Zm8.8 8.8c-.86 0-1.7-.13-2.48-.36l2.64-7.67 2.7 7.4c.02.04.04.08.06.12A8.77 8.77 0 0 1 12 20.8Zm4.13-1.27 2.55-7.37c.48-1.19.63-2.14.63-2.99 0-.31-.02-.59-.06-.86A8.76 8.76 0 0 1 20.8 12a8.8 8.8 0 0 1-4.67 7.53Z" />
    </svg>
  );
}

function SanityMark({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M5.6 5.06c0 2.1 1.31 3.35 3.94 4l2.78.64c2.48.57 4 1.96 4 4.03a3.9 3.9 0 0 1-1.6 3.2c0-2.28-1.2-3.5-4.08-4.25l-2.73-.62C5.7 11.53 4.06 10.3 4.06 8.05a3.9 3.9 0 0 1 1.54-3ZM15.1 14.6c1.18.75 1.7 1.8 1.7 3.3-.97 1.24-2.71 1.93-4.77 1.93-3.46 0-5.9-1.69-6.44-4.65h3.34c.43 1.36 1.57 1.99 3.08 1.99 1.84 0 3.06-.97 3.09-2.57ZM8.83 9.32C7.75 8.68 7.18 7.7 7.18 6.33A5.7 5.7 0 0 1 11.79 4.3c3.53 0 5.58 1.85 6.09 4.44h-3.22c-.35-1.02-1.23-1.82-2.83-1.82-1.71 0-2.88.99-2.99 2.4Z" />
    </svg>
  );
}

function PayloadMark({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M11.4 1.6 21 7.05v10.9l-6.6 3.74V10.4L4.3 4.62 11.4 1.6Zm-2.5 8.63v11.2L3 18.05V7.6l5.9 2.63Z" />
    </svg>
  );
}

const ICON_MAP: Record<string, React.ElementType> = {
  github: GithubLogo,
  google: GoogleLogo,
  wordpress: WordpressMark,
  sanity: SanityMark,
  payload: PayloadMark,
  rest: CodeIcon,
  graphql: Graph,
};

/** Brand mark for a connector. Unknown keys fall back to a generic plug. */
export function ConnectorIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICON_MAP[name] ?? Plug;
  return <Icon className={className} />;
}
