import { PublicFormShell } from "@/components/forms/public-form-shell";

export const dynamic = "force-dynamic";

/**
 * `?i=` carries a one-person invite token when the form was SENT to a known
 * lead or customer, rather than found by public traffic. It rides in the
 * query string so the link survives being forwarded, copied out of an email,
 * or opened on a different device — none of which a cookie would.
 *
 * Only /f takes it. The embed is meant for a public page, where a personal
 * token has no business being.
 */
export default async function PublicFormPage({
  params, searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ i?: string }>;
}) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  return <PublicFormShell slug={slug} invite={sp.i} />;
}
