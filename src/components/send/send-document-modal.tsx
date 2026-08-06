"use client";

import { useEffect, useState } from "react";
import { Loader2, Mail, MessageSquare, Plus, Send, X, Clock } from "@/components/ui/icons";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Channel = "email" | "sms";

export interface SendDocumentResult {
  channel: Channel;
  recipients?: string[];
  subject?: string;
  /** Covering note for THIS send, above the document details. */
  message?: string;
  to?: string;
  body?: string;
}

interface SendDocumentModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** "Quote" or "Invoice" — used in titles + default subject */
  docType: string;
  /** Document number, e.g. "QUO-0001" */
  docNumber: string;
  /** Pre-filled email recipient(s) — typically the customer's email */
  defaultEmails: string[];
  /** Pre-filled SMS recipient — typically the customer's phone */
  defaultPhone?: string | null;
  /** Default subject — usually computed by parent */
  defaultSubject: string;
  /** Default SMS body */
  defaultSmsBody?: string;
  /** Called when the user clicks send */
  onSend: (result: SendDocumentResult) => Promise<void>;
  /** Optional — when provided, the modal exposes a "Schedule for later"
   *  toggle. Receives the same payload as onSend plus the chosen ISO time. */
  onSchedule?: (sendAtIso: string, result: SendDocumentResult) => Promise<void>;
}

function isValidEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export function SendDocumentModal({
  open,
  onOpenChange,
  docType,
  docNumber,
  defaultEmails,
  defaultPhone,
  defaultSubject,
  defaultSmsBody,
  onSend,
  onSchedule,
}: SendDocumentModalProps) {
  const [channel, setChannel] = useState<Channel>("email");
  const [emails, setEmails] = useState<string[]>(defaultEmails);
  const [emailInput, setEmailInput] = useState("");
  const [subject, setSubject] = useState(defaultSubject);
  const [message, setMessage] = useState("");
  const [phone, setPhone] = useState(defaultPhone ?? "");
  const [smsBody, setSmsBody] = useState(defaultSmsBody ?? "");
  const [sending, setSending] = useState(false);
  const [schedule, setSchedule] = useState(false);
  const [sendAtLocal, setSendAtLocal] = useState<string>("");

  // Re-sync defaults whenever the modal opens
  useEffect(() => {
    if (open) {
      setChannel("email");
      setEmails(defaultEmails);
      setEmailInput("");
      setSubject(defaultSubject);
      setPhone(defaultPhone ?? "");
      setSmsBody(defaultSmsBody ?? "");
      setSchedule(false);
      // Default the picker to "in 1 hour" so the form is never blank.
      const inOneHour = new Date(Date.now() + 60 * 60 * 1000);
      const pad = (n: number) => String(n).padStart(2, "0");
      setSendAtLocal(
        `${inOneHour.getFullYear()}-${pad(inOneHour.getMonth() + 1)}-${pad(inOneHour.getDate())}T${pad(inOneHour.getHours())}:${pad(inOneHour.getMinutes())}`
      );
    }
  }, [open, defaultEmails, defaultSubject, defaultPhone, defaultSmsBody]);

  const addEmail = () => {
    const v = emailInput.trim();
    if (!v) return;
    if (!isValidEmail(v)) { toast.error(`"${v}" is not a valid email`); return; }
    if (emails.includes(v)) { setEmailInput(""); return; }
    setEmails((prev) => [...prev, v]);
    setEmailInput("");
  };

  const removeEmail = (e: string) => setEmails((prev) => prev.filter((x) => x !== e));

  const handleSend = async () => {
    if (channel === "email") {
      if (emails.length === 0) { toast.error("Add at least one email address"); return; }
      if (!subject.trim()) { toast.error("Subject is required"); return; }
    } else {
      if (!phone.trim()) { toast.error("Phone number is required"); return; }
      if (!smsBody.trim()) { toast.error("Message body is required"); return; }
    }

    const result: SendDocumentResult = channel === "email"
      ? { channel: "email", recipients: emails, subject: subject.trim(), message: message.trim() || undefined }
      : { channel: "sms", to: phone.trim(), body: smsBody.trim() };

    let sendAtIso: string | null = null;
    if (schedule) {
      if (!sendAtLocal) { toast.error("Pick a date and time"); return; }
      const d = new Date(sendAtLocal);
      if (Number.isNaN(d.getTime())) { toast.error("Invalid date/time"); return; }
      if (d.getTime() <= Date.now() + 30_000) { toast.error("Pick a time at least a minute in the future"); return; }
      sendAtIso = d.toISOString();
    }

    setSending(true);
    try {
      if (sendAtIso && onSchedule) await onSchedule(sendAtIso, result);
      else                          await onSend(result);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!sending) onOpenChange(v); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="w-4 h-4" />
            Send {docType} {docNumber}
          </DialogTitle>
        </DialogHeader>

        {/* Channel switcher */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setChannel("email")}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md border text-sm font-medium transition-colors ${
              channel === "email" ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"
            }`}
          >
            <Mail className="w-4 h-4" /> Email
          </button>
          <button
            type="button"
            onClick={() => setChannel("sms")}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md border text-sm font-medium transition-colors ${
              channel === "sms" ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"
            }`}
          >
            <MessageSquare className="w-4 h-4" /> SMS
          </button>
        </div>

        {channel === "email" ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Recipients</Label>
              <div className="flex flex-wrap gap-1.5 p-2 border rounded-md min-h-[42px] bg-background">
                {emails.map((e) => (
                  <span key={e} className="inline-flex items-center gap-1 bg-muted text-xs rounded-full pl-2.5 pr-1 py-1">
                    {e}
                    <button type="button" onClick={() => removeEmail(e)} className="hover:text-destructive">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                <input
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addEmail(); }
                    if (e.key === "Backspace" && !emailInput && emails.length > 0) {
                      setEmails((prev) => prev.slice(0, -1));
                    }
                  }}
                  onBlur={addEmail}
                  placeholder={emails.length ? "Add another…" : "name@example.com"}
                  className="flex-1 min-w-[140px] bg-transparent text-sm outline-none"
                />
                {emailInput && (
                  <button
                    type="button"
                    onClick={addEmail}
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <Plus className="w-3 h-3" /> add
                  </button>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">Press Enter or comma to add. Backspace to remove last.</p>
            </div>

            <div className="space-y-1.5">
              <Label>Subject</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
              <div className="mt-3 space-y-1.5">
                <Label>Message <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Textarea
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={"Hi Sarah, as discussed — here's the invoice for the work last week. Any questions, just reply."}
                />
                <p className="text-xs text-muted-foreground">
                  Added to the top of this email only. Your saved template wording stays as it is.
                </p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              The PDF and email body are generated automatically and include a customer-portal link.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Phone number</Label>
              <Input
                type="tel"
                placeholder="+61 412 345 678"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">Use international format (E.164), e.g. +61412345678</p>
            </div>
            <div className="space-y-1.5">
              <Label>Message</Label>
              <Textarea rows={4} value={smsBody} onChange={(e) => setSmsBody(e.target.value)} />
              <p className="text-[11px] text-muted-foreground">{smsBody.length} chars</p>
            </div>
          </div>
        )}

        {onSchedule && (
          <div className="space-y-3 pt-2 border-t">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={schedule}
                onChange={(e) => setSchedule(e.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              <Clock className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium">Schedule for later</span>
            </label>
            {schedule && (
              <div className="space-y-1.5 pl-6">
                <Label>Send at</Label>
                <DateTimePicker value={sendAtLocal} onChange={setSendAtLocal} />
                <p className="text-[11px] text-muted-foreground">
                  Times are in your local timezone. We&apos;ll dispatch within ~1 minute of the scheduled moment.
                </p>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={handleSend} disabled={sending}>
            {sending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              : schedule ? <Clock className="w-3.5 h-3.5 mr-1.5" />
              : <Send className="w-3.5 h-3.5 mr-1.5" />}
            {schedule
              ? `Schedule ${channel === "email" ? "email" : "SMS"}`
              : `Send ${channel === "email" ? "email" : "SMS"}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
