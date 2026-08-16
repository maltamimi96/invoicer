import type { Metadata } from "next";
import { CustomerSurface } from "@/components/layout/customer-surface";

/**
 * Nothing under here should ever appear in a search result.
 *
 * These pages are reachable by URL — that is the whole point of a token link —
 * and they carry a named customer's address, what they were charged and what
 * they still owe. A token in a crawled referrer, a link pasted into a public
 * thread, and an invoice is indexed under someone's name. /book already set
 * this; the surfaces with the money on them did not.
 *
 * On the layout so it covers every current and future route beneath it, rather
 * than relying on each page to remember.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true,
            googleBot: { index: false, follow: false } },
};

/** Customer-facing: pinned light, never the operator's dashboard theme. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <CustomerSurface>{children}</CustomerSurface>;
}
