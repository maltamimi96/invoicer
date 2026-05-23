import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Kirei",
  description: "How Kirei collects, uses, and protects your data.",
};

const UPDATED = "23 May 2026";
const CONTACT = "support@kireihq.com";

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-[15px] leading-relaxed text-zinc-800">
      <h1 className="text-3xl font-bold tracking-tight text-zinc-900">Privacy Policy</h1>
      <p className="mt-2 text-sm text-zinc-500">Last updated: {UPDATED}</p>

      <Section title="Who we are">
        Kirei (“we”, “us”) is a field-services business management app — quotes, invoices,
        jobs, customers, and scheduling for trade businesses. This policy explains what we
        collect, why, and your choices. It applies to the Kirei mobile apps (iOS &amp; Android)
        and the web app at kireihq.com.
      </Section>

      <Section title="Information we collect">
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Account data</strong> — your name, email, and password (passwords are stored hashed by our authentication provider, never in plain text).</li>
          <li><strong>Business data you enter</strong> — customers, contacts, quotes, invoices, work orders, leads, tasks, products, photos, and related notes.</li>
          <li><strong>Photos &amp; files</strong> — job photos and documents you upload, stored in secure cloud storage.</li>
          <li><strong>Usage &amp; device data</strong> — basic technical information (device type, app version, error logs) used to operate and improve the app.</li>
          <li><strong>Voice input</strong> — if you use voice features, audio is sent to a transcription service to convert it to text; it is not retained after transcription.</li>
        </ul>
      </Section>

      <Section title="How we use it">
        <ul className="list-disc space-y-1 pl-5">
          <li>To provide the core features — creating and sending quotes/invoices, managing jobs and customers, scheduling, and reporting.</li>
          <li>To send transactional emails on your behalf (e.g. a quote or invoice to your customer) and account emails to you.</li>
          <li>To secure your account and isolate each business’s data from every other business.</li>
          <li>To diagnose problems and improve reliability and performance.</li>
        </ul>
        <p className="mt-3">We do <strong>not</strong> sell your data or your customers’ data, and we do not use it for advertising.</p>
      </Section>

      <Section title="AI features">
        Some features use AI (e.g. classifying inbound emails into leads/tasks, drafting quotes,
        and the assistant). Relevant text is processed by our AI provider to generate the result.
        We do not use your data to train third-party models, and providers we use operate under
        zero-retention terms where available.
      </Section>

      <Section title="Sharing &amp; processors">
        We share data only with the service providers that run the app on our behalf, under
        contract and only as needed to provide the service:
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li><strong>Supabase</strong> — database, authentication, and file storage.</li>
          <li><strong>Vercel</strong> — application hosting.</li>
          <li><strong>Resend</strong> — sending the emails you trigger.</li>
          <li><strong>Anthropic / OpenAI</strong> — AI text generation and voice transcription.</li>
        </ul>
        We may also disclose data if required by law.
      </Section>

      <Section title="Data retention">
        We keep your data for as long as your account is active. When you delete a record it is
        removed from the live database. If you close your account, contact us and we will delete
        your business’s data within 30 days, except where we must retain it to meet legal or
        tax obligations.
      </Section>

      <Section title="Security">
        Data is encrypted in transit (HTTPS) and at rest. Every business’s data is isolated at
        the database level so one business can never read another’s. Access is restricted to the
        authenticated owner and the team members they invite.
      </Section>

      <Section title="Your rights">
        You can access, correct, export, or delete your data at any time from within the app, or
        by contacting us. Depending on your location you may have additional rights under laws
        such as the Australian Privacy Act, GDPR, or CCPA — we honour these requests.
      </Section>

      <Section title="Children">
        Kirei is a business tool and is not directed to anyone under 16. We do not knowingly
        collect data from children.
      </Section>

      <Section title="Changes">
        We may update this policy; we’ll change the “last updated” date above and, for material
        changes, notify you in the app.
      </Section>

      <Section title="Contact">
        Questions or data requests: <a className="text-teal-700 underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold text-zinc-900">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}
