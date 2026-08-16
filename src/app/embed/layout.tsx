import type { Metadata } from "next";
import { CustomerSurface } from "@/components/layout/customer-surface";

/**
 * An embed is an iframe target, not a destination.
 *
 * If it gets indexed, a searcher lands on a chrome-less form floating on a
 * blank page with no idea whose business it belongs to. The hosted version at
 * /f/[slug] is the page meant to be found, and it stays indexable.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true,
            googleBot: { index: false, follow: false } },
};

/** Customer-facing: pinned light, never the operator's dashboard theme. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <CustomerSurface>{children}</CustomerSurface>;
}
