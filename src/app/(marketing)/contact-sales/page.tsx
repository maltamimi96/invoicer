import type { Metadata } from "next";
import { ContactForm } from "@/components/marketing/contact-form";

export const metadata: Metadata = {
  title: "Contact sales — Kirei",
  description: "Tell us how you work and we'll tell you honestly whether Kirei fits.",
};

export default async function ContactSalesPage({
  searchParams,
}: { searchParams: Promise<{ solution?: string }> }) {
  const { solution } = await searchParams;
  return (
    <div className="grid gap-10 pt-12 lg:grid-cols-[1fr_1.2fr]">
      <section>
        <h1 className="text-4xl font-semibold tracking-tight">Contact sales</h1>
        <p className="mt-4 text-muted-foreground">
          Tell us how you work now and what isn&rsquo;t working about it. We&rsquo;ll tell you honestly
          whether Kirei fits — including when it doesn&rsquo;t.
        </p>
        <p className="mt-4 text-sm text-muted-foreground">
          Already using Kirei and need a hand? <a href="/support" className="text-primary hover:underline">Support</a> is
          the faster route.
        </p>
      </section>
      <ContactForm defaultSolution={solution} />
    </div>
  );
}
