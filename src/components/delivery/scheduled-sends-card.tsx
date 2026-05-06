"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Clock, X } from "@/components/ui/icons";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getScheduledSends, cancelScheduledSend, type ScheduledSend } from "@/lib/actions/scheduled-sends";

interface Props {
  docType: "invoice" | "quote";
  docId: string;
}

const STATUS_LABEL: Record<ScheduledSend["status"], string> = {
  pending:   "Pending",
  sending:   "Dispatching…",
  sent:      "Sent",
  cancelled: "Cancelled",
  failed:    "Failed",
};

export function ScheduledSendsCard({ docType, docId }: Props) {
  const router = useRouter();
  const [rows, setRows] = useState<ScheduledSend[] | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await getScheduledSends(docType, docId);
      setRows(r);
    } catch { /* non-fatal */ }
  }, [docType, docId]);

  useEffect(() => { refresh(); }, [refresh]);

  if (rows === null || rows.length === 0) return null;

  const handleCancel = async (id: string) => {
    try {
      await cancelScheduledSend(id);
      toast.success("Scheduled send cancelled");
      await refresh();
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't cancel");
    }
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-2.5">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" /> Scheduled sends
        </p>
        <ul className="space-y-1.5">
          {rows.map((r) => {
            const when = new Date(r.send_at).toLocaleString();
            const recip = r.channel === "email"
              ? (r.recipients ?? []).join(", ")
              : (r.to_phone ?? "");
            const tone =
              r.status === "pending"   ? "bg-amber-100 text-amber-800" :
              r.status === "sending"   ? "bg-blue-100  text-blue-800"  :
              r.status === "sent"      ? "bg-emerald-100 text-emerald-800" :
              r.status === "cancelled" ? "bg-muted text-muted-foreground" :
                                         "bg-rose-100 text-rose-800";
            return (
              <li key={r.id} className="flex items-center justify-between gap-3 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${tone}`}>
                    {STATUS_LABEL[r.status]}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs">{when}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {r.channel === "email" ? "Email" : "SMS"} · {recip}
                    </p>
                  </div>
                </div>
                {r.status === "pending" && (
                  <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => handleCancel(r.id)}>
                    <X className="w-3.5 h-3.5" />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
        {rows.some((r) => r.status === "failed" && r.last_error) && (
          <p className="text-[11px] text-rose-700 pt-1">
            {rows.find((r) => r.status === "failed")?.last_error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
