import { notFound } from "next/navigation";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, FileStack, Download } from "@/components/ui/icons";
import { fillMergeFields } from "@/lib/contracts/render";
import { formatDate } from "@/lib/utils";
import { SignContract } from "@/components/customer-portal/sign-contract";

export const dynamic = "force-dynamic";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: any, name: string) => sb.from(name);

export default async function PortalContractPage({ params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  const sb = createAdminClient();

  const { data: link } = await tbl(sb, "customer_portal_tokens")
    .select("business_id, customer_id, expires_at, revoked_at").eq("token", token).maybeSingle();
  if (!link || link.revoked_at) notFound();
  if (link.expires_at && new Date(link.expires_at) < new Date()) notFound();

  const [{ data: contract }, { data: business }, { data: customer }] = await Promise.all([
    tbl(sb, "contracts").select("*").eq("id", id).eq("business_id", link.business_id).eq("customer_id", link.customer_id).maybeSingle(),
    tbl(sb, "businesses").select("name, logo_url, phone, email, address").eq("id", link.business_id).maybeSingle(),
    tbl(sb, "customers").select("name, company, email, address").eq("id", link.customer_id).maybeSingle(),
  ]);
  if (!contract) notFound();

  // Best-effort: mark as viewed the first time the customer opens it.
  if (contract.status === "sent") {
    void tbl(sb, "contracts").update({ status: "viewed", viewed_at: new Date().toISOString() })
      .eq("id", id).then(() => {}, () => {});
  }

  const isSigned = contract.status === "signed";
  const isVoided = contract.status === "voided";
  const bodyHtml = contract.kind === "rich_text"
    ? fillMergeFields(contract.content_html ?? "", {
        customer, business,
        date: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
      })
    : "";

  // Signed-PDF link (the route serves it with the portal token).
  const signedPdfUrl = `/api/pdf/contract/${id}?token=${token}`;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      <header className="border-b bg-background/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-center justify-between gap-4">
          <Link href={`/portal/${token}`} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" /> Back
          </Link>
          <div className="flex items-center gap-3">
            {business?.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img loading="lazy" decoding="async" src={business.logo_url} alt={business.name} className="w-14 h-14 rounded-lg object-contain bg-white border border-border p-1" />
            ) : null}
            <div className="text-right">
              <p className="font-semibold text-sm">{business?.name}</p>
              {business?.phone && <p className="text-xs text-muted-foreground">{business.phone}</p>}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <FileStack className="w-6 h-6 text-indigo-500" />
              <h1 className="text-2xl font-bold">{contract.title}</h1>
            </div>
            <p className="text-sm text-muted-foreground mt-1">From {business?.name}</p>
          </div>
          <StatusBadge status={contract.status} />
        </div>

        {/* Body */}
        {contract.kind === "pdf" ? (
          <Card className="p-6 text-center space-y-3">
            <p className="text-sm text-muted-foreground">This contract is a PDF document.</p>
            <a href={`/api/pdf/contract/${id}/source?token=${token}`} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-border bg-card text-sm font-medium hover:bg-muted">
              <Download className="w-3.5 h-3.5" /> Open the document
            </a>
          </Card>
        ) : (
          <Card className="p-6">
            <div className="prose prose-sm max-w-none break-words" dangerouslySetInnerHTML={{ __html: bodyHtml }} />
          </Card>
        )}

        {/* Action */}
        {isSigned ? (
          <Card className="p-6 border-emerald-500/30 bg-emerald-500/5 text-center space-y-2">
            <p className="font-medium text-emerald-600 dark:text-emerald-400">✓ Signed</p>
            <p className="text-xs text-muted-foreground">
              Signed by {contract.signer_name} on {contract.signed_at ? formatDate(contract.signed_at) : ""}.
            </p>
            <a href={signedPdfUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-border bg-card text-sm font-medium hover:bg-muted">
              <Download className="w-3.5 h-3.5" /> Download signed copy
            </a>
          </Card>
        ) : isVoided ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">This contract is no longer active.</Card>
        ) : (
          <Card className="p-6 space-y-4">
            <div>
              <p className="font-semibold">Sign this contract</p>
              <p className="text-sm text-muted-foreground">Review the contract above, then add your signature below.</p>
            </div>
            <SignContract token={token} contractId={id} />
          </Card>
        )}

        <footer className="text-center text-xs text-muted-foreground py-6 border-t">Powered by Kirei</footer>
      </main>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    signed: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    sent: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    viewed: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    declined: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
    voided: "bg-muted text-muted-foreground",
    draft: "bg-muted text-muted-foreground",
  };
  return <Badge variant="secondary" className={map[status] || "bg-muted"}>{status}</Badge>;
}
