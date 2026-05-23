import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Support — Kirei",
  description: "Get help with the Kirei app.",
};

const CONTACT = "support@kireihq.com";

export default function SupportPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-[15px] leading-relaxed text-zinc-800">
      <h1 className="text-3xl font-bold tracking-tight text-zinc-900">Support</h1>
      <p className="mt-3">
        Need a hand with Kirei? We’re happy to help.
      </p>

      <section className="mt-8 rounded-xl border border-zinc-200 bg-zinc-50 p-6">
        <h2 className="text-lg font-semibold text-zinc-900">Contact us</h2>
        <p className="mt-2">
          Email <a className="text-teal-700 underline" href={`mailto:${CONTACT}`}>{CONTACT}</a> and
          we’ll get back to you, usually within one business day. Please include:
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Your business name</li>
          <li>What you were trying to do</li>
          <li>What happened (a screenshot helps)</li>
          <li>Your device + app version (Settings → About)</li>
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-zinc-900">Common questions</h2>
        <Faq q="How do I send a quote or invoice to a customer?">
          Open the quote or invoice, tap Send, and confirm the recipient. We email it as a PDF
          with a link your customer can view (and pay/accept) online.
        </Faq>
        <Faq q="My customer didn’t receive the email.">
          Check the Email delivery panel on the quote/invoice — it shows sent / delivered /
          bounced. Ask the customer to check spam. If it shows bounced, verify the email address.
        </Faq>
        <Faq q="How do I add a team member?">
          Go to Team → Add member, enter their email, and pick their access level. Workers only
          see the jobs assigned to them.
        </Faq>
        <Faq q="How do I delete my account or data?">
          Email us at {CONTACT} from your account address and we’ll permanently delete your
          business’s data within 30 days.
        </Faq>
      </section>

      <p className="mt-10 text-sm text-zinc-500">
        See also our <a className="text-teal-700 underline" href="/privacy">Privacy Policy</a>.
      </p>
    </main>
  );
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <p className="font-medium text-zinc-900">{q}</p>
      <p className="mt-1 text-zinc-700">{children}</p>
    </div>
  );
}
