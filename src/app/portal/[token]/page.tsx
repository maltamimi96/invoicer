import { notFound } from "next/navigation";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { FileText, FileCheck, Wrench, MapPin, Mail, Phone, Building2, Clock } from "@/components/ui/icons";

export const dynamic = "force-dynamic";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: any, name: string) => sb.from(name);

export default async function CustomerPortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sb = createAdminClient();

  const { data: link } = await tbl(sb, "customer_portal_tokens")
    .select("*")
    .eq("token", token)
    .maybeSingle();

  if (!link || link.revoked_at) notFound();
  if (link.expires_at && new Date(link.expires_at) < new Date()) notFound();

  // Touch last_used_at (best-effort)
  await tbl(sb, "customer_portal_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("token", token);

  const [{ data: customer }, { data: business }] = await Promise.all([
    tbl(sb, "customers").select("*").eq("id", link.customer_id).maybeSingle(),
    tbl(sb, "businesses").select("name, logo_url, accent_color, email, phone").eq("id", link.business_id).maybeSingle(),
  ]);
  if (!customer) notFound();

  const [{ data: invoices }, { data: quotes }, { data: workOrders }] = await Promise.all([
    tbl(sb, "invoices")
      .select("id, number, status, issue_date, due_date, total, amount_paid")
      .eq("business_id", link.business_id)
      .eq("customer_id", link.customer_id)
      .order("issue_date", { ascending: false }),
    tbl(sb, "quotes")
      .select("id, number, status, issue_date, expiry_date, total")
      .eq("business_id", link.business_id)
      .eq("customer_id", link.customer_id)
      .order("issue_date", { ascending: false }),
    tbl(sb, "work_orders")
      .select("id, number, title, status, scheduled_date, share_token, property_address")
      .eq("business_id", link.business_id)
      .eq("customer_id", link.customer_id)
      .order("scheduled_date", { ascending: false }),
  ]);

  const invs = invoices ?? [];
  const qts = quotes ?? [];
  const wos = workOrders ?? [];
  const totalOwing = invs
    .filter((i: { status: string }) => i.status !== "paid" && i.status !== "cancelled")
    .reduce((s: number, i: { total: number; amount_paid: number }) => s + (i.total - (i.amount_paid || 0)), 0);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      {/* Header */}
      <header className="border-b bg-background/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {business?.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={business.logo_url} alt={business.name} className="w-10 h-10 rounded-lg object-contain" />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-primary" />
              </div>
            )}
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Customer portal</p>
              <h1 className="font-semibold truncate">{business?.name ?? "Your provider"}</h1>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-3 text-xs text-muted-foreground">
            {business?.email && <a href={`mailto:${business.email}`} className="flex items-center gap-1 hover:text-foreground"><Mail className="w-3.5 h-3.5" />{business.email}</a>}
            {business?.phone && <a href={`tel:${business.phone}`} className="flex items-center gap-1 hover:text-foreground"><Phone className="w-3.5 h-3.5" />{business.phone}</a>}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {/* Greeting */}
        <section>
          <h2 className="text-2xl font-bold">Hi {customer.name?.split(" ")[0] ?? customer.name} 👋</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Everything you have with {business?.name ?? "us"} in one place.
          </p>
        </section>

        {/* Summary cards */}
        <section className="grid sm:grid-cols-3 gap-4">
          <SummaryCard icon={FileText} label="Invoices" count={invs.length} accent="emerald" />
          <SummaryCard icon={FileCheck} label="Quotes" count={qts.length} accent="violet" />
          <SummaryCard icon={Wrench} label="Jobs" count={wos.length} accent="blue" />
        </section>

        {totalOwing > 0 && (
          <Card className="p-5 border-amber-500/30 bg-amber-500/5">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="text-xs uppercase tracking-wider text-amber-600 dark:text-amber-400 font-semibold">Outstanding balance</p>
                <p className="text-2xl font-bold mt-1">{formatCurrency(totalOwing)}</p>
              </div>
              <Badge variant="secondary" className="bg-amber-500/15 text-amber-600 dark:text-amber-400">Across {invs.filter((i: {status: string}) => i.status !== "paid" && i.status !== "cancelled").length} invoice(s)</Badge>
            </div>
          </Card>
        )}

        {/* Invoices */}
        <section>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4 text-emerald-500" /> Invoices
          </h3>
          {invs.length === 0 ? (
            <EmptyRow text="No invoices yet." />
          ) : (
            <div className="space-y-2">
              {invs.map((inv: { id: string; number: string; status: string; issue_date: string; due_date: string; total: number; amount_paid: number }) => (
                <Card key={inv.id} className="p-4 flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">#{inv.number}</span>
                      <StatusBadge status={inv.status} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Issued {formatDate(inv.issue_date)} · Due {formatDate(inv.due_date)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{formatCurrency(inv.total)}</p>
                    {inv.amount_paid > 0 && inv.amount_paid < inv.total && (
                      <p className="text-xs text-emerald-500">{formatCurrency(inv.amount_paid)} paid</p>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* Quotes */}
        <section>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <FileCheck className="w-4 h-4 text-violet-500" /> Quotes
          </h3>
          {qts.length === 0 ? (
            <EmptyRow text="No quotes yet." />
          ) : (
            <div className="space-y-2">
              {qts.map((q: { id: string; number: string; status: string; issue_date: string; expiry_date: string; total: number }) => (
                <Link key={q.id} href={`/portal/${token}/quote/${q.id}`}>
                  <Card className="p-4 flex items-center justify-between gap-4 hover:shadow-md transition-shadow">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">#{q.number}</span>
                        <StatusBadge status={q.status} />
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Issued {formatDate(q.issue_date)} · Expires {formatDate(q.expiry_date)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{formatCurrency(q.total)}</p>
                      <p className="text-xs text-violet-500 mt-0.5">View →</p>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Work orders */}
        <section>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Wrench className="w-4 h-4 text-blue-500" /> Jobs
          </h3>
          {wos.length === 0 ? (
            <EmptyRow text="No jobs yet." />
          ) : (
            <div className="space-y-2">
              {wos.map((w: { id: string; number: string; title: string; status: string; scheduled_date: string | null; share_token: string | null; property_address: string | null }) => {
                const inner = (
                  <Card className={`p-4 flex items-center justify-between gap-4 ${w.share_token ? "hover:shadow-md transition-shadow" : ""}`}>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">#{w.number}</span>
                        <StatusBadge status={w.status} />
                      </div>
                      <p className="text-sm mt-1 truncate">{w.title}</p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
                        {w.scheduled_date && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatDate(w.scheduled_date)}</span>}
                        {w.property_address && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{w.property_address}</span>}
                      </div>
                    </div>
                    {w.share_token && <span className="text-xs text-blue-500 font-medium flex-shrink-0">View →</span>}
                  </Card>
                );
                return w.share_token
                  ? <Link key={w.id} href={`/jobs/${w.share_token}`}>{inner}</Link>
                  : <div key={w.id}>{inner}</div>;
              })}
            </div>
          )}
        </section>

        <footer className="text-center text-xs text-muted-foreground py-6 border-t">
          Powered by Invoicer · This link is private to {customer.name}
        </footer>
      </main>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, count, accent }: { icon: React.ComponentType<{ className?: string }>; label: string; count: number; accent: string }) {
  const colors: Record<string, string> = {
    emerald: "text-emerald-500 bg-emerald-500/10",
    violet:  "text-violet-500 bg-violet-500/10",
    blue:    "text-blue-500 bg-blue-500/10",
  };
  return (
    <Card className="p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colors[accent]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-bold">{count}</p>
      </div>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    paid:      "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    accepted:  "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    completed: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    sent:      "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    overdue:   "bg-rose-500/15 text-rose-600 dark:text-rose-400",
    rejected:  "bg-rose-500/15 text-rose-600 dark:text-rose-400",
    cancelled: "bg-muted text-muted-foreground",
    expired:   "bg-muted text-muted-foreground",
    draft:     "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    partial:   "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  };
  return <Badge variant="secondary" className={map[status] || "bg-muted"}>{status}</Badge>;
}

function EmptyRow({ text }: { text: string }) {
  return <Card className="p-6 text-center text-sm text-muted-foreground">{text}</Card>;
}
