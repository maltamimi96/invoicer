/**
 * Public self-serve booking management: kireihq.com/booking/{manage_token}
 * Lets a customer view, reschedule, or cancel their booking without logging in.
 */
import type { Metadata } from "next";
import { ManageWidget } from "./manage-widget";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Manage your booking", robots: { index: false } };

export default async function ManagePage({ params }: { params: Promise<{ manage_token: string }> }) {
  const { manage_token } = await params;
  return <ManageWidget token={manage_token} />;
}
