/**
 * Public hosted booking page: kireihq.com/book/{slug}
 * Themed per business. Works standalone or inside an embed iframe (?embed=1).
 * All data comes from the public slug-scoped API — no auth.
 */
import type { Metadata } from "next";
import { BookingWidget } from "./booking-widget";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return {
    title: "Book an appointment",
    robots: { index: false }, // per-tenant booking pages shouldn't be indexed
    alternates: { canonical: `/book/${slug}` },
  };
}

export default async function BookPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <BookingWidget slug={slug} />;
}
