"use client";

/**
 * Every client account on one screen.
 *
 * Clicking a card switches the active business and lands you inside it, which
 * is the point: the console is for spotting what needs you, not for doing the
 * work. The work still happens inside a business.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTrackedRefresh } from "@/components/layout/use-mutation";
import { toast } from "sonner";
import {
  AlertTriangle, Building2, Clock, CalendarDays, Loader2, Plus, ChevronRight,
} from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/page-header";
import { useAppLoading } from "@/components/layout/app-loading";
import { AddBusinessModal } from "@/components/business/add-business-modal";
import { setActiveBusiness } from "@/lib/actions/business";
import { rememberTabBusiness } from "@/components/layout/tab-business-guard";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { ClientAccount } from "@/lib/actions/agency-console";

export function ClientAccountsClient({ accounts }: { accounts: ClientAccount[] }) {
  const router = useRouter();
  // The scrim has to outlast the refresh: a local `finally { setBusy(false) }`
  // fires when refresh() is CALLED, not when the server output arrives.
  const { refresh } = useTrackedRefresh();
  const { setBusy } = useAppLoading();
  const [addOpen, setAddOpen] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);

  const totals = accounts.reduce(
    (acc, a) => ({
      outstanding: acc.outstanding + a.outstanding,
      overdue: acc.overdue + a.overdue,
      jobsToday: acc.jobsToday + a.jobsToday,
    }),
    { outstanding: 0, overdue: 0, jobsToday: 0 },
  );
  // Mixed currencies would make one total meaningless, so it is only shown
  // when every account bills in the same one.
  const currencies = new Set(accounts.map((a) => a.currency));
  const oneCurrency = currencies.size === 1 ? [...currencies][0] : null;

  const open = async (account: ClientAccount) => {
    setSwitching(account.id);
    setBusy(`Opening ${account.name}…`);
    // Claim the tab BEFORE the cookie flips — same order the switcher uses.
    // The tab guard compares the cookie against this tab's remembered
    // business, so flipping first makes it bounce straight back.
    rememberTabBusiness(account.id);
    try {
      await setActiveBusiness(account.id);
      router.push("/dashboard");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't open that account");
      setBusy(null);
    } finally { setSwitching(null); }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Client accounts"
        subtitle="The businesses you run, and what needs you in each."
        actions={
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Add client account
          </Button>
        }
      />

      {accounts.length > 1 && oneCurrency && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Tile label="Outstanding, everywhere" value={formatCurrency(totals.outstanding, oneCurrency)} />
          <Tile label="Overdue, everywhere" value={formatCurrency(totals.overdue, oneCurrency)}
                tone={totals.overdue > 0 ? "bad" : undefined} />
          <Tile label="Jobs booked today" value={String(totals.jobsToday)} />
        </div>
      )}

      {accounts.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
          <Building2 className="mx-auto mb-2 h-7 w-7 opacity-40" />
          No client accounts yet.
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {accounts.map((a) => (
            <Card key={a.id} className="transition-colors hover:border-border-strong">
              <CardContent className="flex flex-wrap items-center gap-4 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium break-words">{a.name}</p>
                    {!a.owned && <Badge variant="outline" className="text-xs">Member</Badge>}
                    {a.overdueCount > 0 && (
                      <Badge className="gap-1 bg-bad/15 text-bad">
                        <AlertTriangle className="h-3 w-3" />
                        {a.overdueCount} overdue
                      </Badge>
                    )}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      {formatCurrency(a.outstanding, a.currency)} outstanding
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <CalendarDays className="h-3.5 w-3.5" />
                      {a.jobsToday} today
                    </span>
                    {/* Silence is information: an account with no invoice for
                        months is the one you have forgotten about. */}
                    <span>
                      {a.lastInvoiceAt ? `last invoice ${formatDate(a.lastInvoiceAt)}` : "no invoices yet"}
                    </span>
                  </div>
                </div>

                <Button size="sm" variant="outline" disabled={switching !== null}
                        onClick={() => open(a)}>
                  {switching === a.id
                    ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    : null}
                  Open <ChevronRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AddBusinessModal open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: "bad" }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={`mt-2 text-2xl font-semibold tabular-nums ${tone === "bad" ? "text-bad" : ""}`}>
        {value}
      </p>
    </div>
  );
}
