"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft, Phone, Mail, MapPin, Clock, MessageSquare,
  UserPlus, FileCheck, Wrench, Trash2,
} from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  updateLeadStatus, deleteLead,
  convertLeadToCustomer, convertLeadToQuote, convertLeadToWorkOrder,
} from "@/lib/actions/leads";
import type { Lead, LeadStatus } from "@/types/database";

const STATUSES: LeadStatus[] = ["new", "contacted", "quoted", "won", "lost"];

const STATUS_BADGE: Record<LeadStatus, string> = {
  new:       "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  contacted: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  quoted:    "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  won:       "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  lost:      "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

const SOURCE_LABELS: Record<string, string> = {
  "landing-page":   "Landing Page",
  "website":        "Website",
  "referral":       "Referral",
  "telegram":       "Telegram",
  "email":          "Email",
  "phone":          "Phone",
  "manual":         "Manual",
  "hipages":        "HiPages",
  "service-seeking":"ServiceSeeking",
  "google":         "Google",
  "facebook":       "Facebook",
  "instagram":      "Instagram",
  "word-of-mouth":  "Word of mouth",
};
const fmtSource = (s: string | null) =>
  !s ? "—" : (SOURCE_LABELS[s] ?? s.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()));

export function LeadDetailClient({ lead: initial }: { lead: Lead }) {
  const router = useRouter();
  const [lead, setLead] = useState<Lead>(initial);
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const setStatus = (status: LeadStatus) => {
    startTransition(async () => {
      try {
        await updateLeadStatus(lead.id, status);
        setLead((prev) => ({ ...prev, status }));
        toast.success(`Marked ${status}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't update");
      }
    });
  };

  const convertCustomer = () => {
    startTransition(async () => {
      try {
        const { customer_id } = await convertLeadToCustomer(lead.id);
        toast.success("Customer created");
        router.push(`/customers/${customer_id}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't convert");
      }
    });
  };

  const convertQuote = () => {
    startTransition(async () => {
      try {
        const { quote_id } = await convertLeadToQuote(lead.id);
        toast.success("Draft quote created");
        router.push(`/quotes/${quote_id}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't convert");
      }
    });
  };

  const convertWorkOrder = () => {
    startTransition(async () => {
      try {
        const { work_order_id } = await convertLeadToWorkOrder(lead.id);
        toast.success("Job created");
        router.push(`/work-orders/${work_order_id}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't convert");
      }
    });
  };

  const remove = () => {
    startTransition(async () => {
      try {
        await deleteLead(lead.id);
        toast.success("Lead deleted");
        router.push("/leads");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't delete");
      }
    });
  };

  const phoneClean = lead.phone?.replace(/\s/g, "");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/leads" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" />
          Leads
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm font-medium">{lead.name}</span>
      </div>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">{lead.name}</h1>
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
            <span>{fmtSource(lead.source)}</span>
            {lead.suburb && (
              <>
                <span>·</span>
                <span className="inline-flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {lead.suburb}
                </span>
              </>
            )}
            <span>·</span>
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {new Date(lead.created_at).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })}
            </span>
          </p>
        </div>
        <Badge className={STATUS_BADGE[lead.status]}>{lead.status}</Badge>
      </div>

      {/* Quick contact actions */}
      <div className="flex gap-2 flex-wrap">
        {phoneClean && (
          <Button asChild variant="default" size="sm">
            <a href={`tel:${phoneClean}`}><Phone className="w-4 h-4 mr-2" />Call</a>
          </Button>
        )}
        {phoneClean && (
          <Button asChild variant="outline" size="sm">
            <a href={`sms:${phoneClean}`}><MessageSquare className="w-4 h-4 mr-2" />SMS</a>
          </Button>
        )}
        {lead.email && (
          <Button asChild variant="outline" size="sm">
            <a href={`mailto:${lead.email}`}><Mail className="w-4 h-4 mr-2" />Email</a>
          </Button>
        )}
      </div>

      {/* Status changer */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Status</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <Button
              key={s}
              variant={s === lead.status ? "default" : "outline"}
              size="sm"
              disabled={pending || s === lead.status}
              onClick={() => setStatus(s)}
            >
              {s}
            </Button>
          ))}
        </CardContent>
      </Card>

      {/* Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          {lead.service        && <Field label="Service"  value={lead.service} />}
          {lead.property_type  && <Field label="Property" value={lead.property_type} />}
          {lead.timing         && <Field label="Timing"   value={lead.timing} />}
          {lead.address        && <Field label="Address"  value={lead.address} />}
          {lead.suburb         && <Field label="Suburb"   value={lead.suburb} />}
          {lead.phone          && <Field label="Phone"    value={lead.phone} />}
          {lead.email          && <Field label="Email"    value={lead.email} />}
          <Field label="Source" value={fmtSource(lead.source)} />
          {(lead.utm_source || lead.utm_medium || lead.utm_campaign) && (
            <Field
              label="Campaign"
              value={[lead.utm_source, lead.utm_medium, lead.utm_campaign].filter(Boolean).join(" / ")}
            />
          )}
        </CardContent>
      </Card>

      {/* Notes */}
      {lead.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap leading-relaxed">{lead.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Convert actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Convert</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button onClick={convertCustomer} disabled={pending || !!lead.customer_id} variant="outline">
            <UserPlus className="w-4 h-4 mr-2" />
            {lead.customer_id ? "Customer linked" : "To customer"}
          </Button>
          <Button onClick={convertQuote} disabled={pending || !!lead.quote_id} variant="outline">
            <FileCheck className="w-4 h-4 mr-2" />
            {lead.quote_id ? "Quote drafted" : "To quote"}
          </Button>
          <Button onClick={convertWorkOrder} disabled={pending} variant="outline">
            <Wrench className="w-4 h-4 mr-2" />
            To work order
          </Button>
        </CardContent>
      </Card>

      {/* Delete */}
      <div className="pt-2">
        <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)} className="text-destructive">
          <Trash2 className="w-4 h-4 mr-2" />
          Delete lead
        </Button>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this lead?</AlertDialogTitle>
            <AlertDialogDescription>
              {lead.name} will be permanently removed. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={remove} disabled={pending} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1">{value}</div>
    </div>
  );
}
