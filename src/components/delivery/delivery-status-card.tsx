"use client";

import { useEffect, useState, useCallback } from "react";
import { CheckCircle, AlertCircle, Mail, Clock, Eye, MousePointer2, RotateCcw } from "@/components/ui/icons";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getDeliveryStatus, type EmailEvent } from "@/lib/actions/email-events";
import type { EmailDocType } from "@/lib/email";
import { formatDate } from "@/lib/utils";

interface Props {
  docType: EmailDocType;
  docId:   string;
}

const META: Record<EmailEvent["status"], { label: string; tone: string; Icon: typeof Mail }> = {
  queued:           { label: "Queued",            tone: "text-muted-foreground bg-muted",        Icon: Clock        },
  sent:             { label: "Sent (in transit)", tone: "text-blue-700 bg-blue-100",             Icon: Mail         },
  delivered:        { label: "Delivered",         tone: "text-emerald-700 bg-emerald-100",       Icon: CheckCircle  },
  opened:           { label: "Opened",            tone: "text-emerald-700 bg-emerald-100",       Icon: Eye          },
  clicked:          { label: "Link clicked",      tone: "text-emerald-700 bg-emerald-100",       Icon: MousePointer2 },
  delivery_delayed: { label: "Delayed",           tone: "text-amber-700 bg-amber-100",           Icon: Clock        },
  bounced:          { label: "Bounced",           tone: "text-rose-700 bg-rose-100",             Icon: AlertCircle  },
  complained:       { label: "Marked as spam",    tone: "text-rose-700 bg-rose-100",             Icon: AlertCircle  },
  failed:           { label: "Failed to send",    tone: "text-rose-700 bg-rose-100",             Icon: AlertCircle  },
};

export function DeliveryStatusCard({ docType, docId }: Props) {
  const [events, setEvents] = useState<EmailEvent[] | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await getDeliveryStatus(docType, docId);
      setEvents(rows);
    } finally {
      setLoading(false);
    }
  }, [docType, docId]);

  useEffect(() => { refresh(); }, [refresh]);

  if (events === null) return null;
  if (events.length === 0) return null; // Hide entirely if never sent.

  return (
    <Card>
      <CardContent className="p-4 space-y-2.5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Email delivery</p>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1" onClick={refresh} disabled={loading}>
            <RotateCcw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
        <ul className="space-y-1.5">
          {events.map((e) => {
            const m = META[e.status] ?? META.sent;
            const Icon = m.Icon;
            const time = e.delivered_at ?? e.opened_at ?? e.bounced_at ?? e.sent_at ?? e.created_at;
            return (
              <li key={e.id} className="flex items-center justify-between gap-3 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${m.tone}`}>
                    <Icon className="w-3 h-3" />
                    {m.label}
                  </span>
                  <span className="truncate text-muted-foreground">{e.recipient}</span>
                </div>
                <span className="text-xs text-muted-foreground flex-shrink-0">{time ? formatDate(time) : ""}</span>
              </li>
            );
          })}
        </ul>
        {events.some((e) => e.status === "bounced" || e.status === "failed") && (
          <p className="text-xs text-rose-700 pt-1">
            Some recipients didn't receive this. If your sender domain isn't verified in Resend yet, only the API key owner's mailbox will receive emails — verify the domain to fix this.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
