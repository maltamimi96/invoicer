"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTrackedRefresh } from "@/components/layout/use-mutation";
import { toast } from "sonner";
import { Loader2, Mail, RotateCcw, Eye } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/layout/page-header";
import {
  saveEmailTemplate,
  resetEmailTemplate,
  previewEmailTemplate,
  type EmailTemplateSummary,
} from "@/lib/actions/email-templates";
import type { EmailTemplateType } from "@/lib/emails/templates";

interface Props {
  initial: EmailTemplateSummary[];
}

interface FormState {
  subject: string;
  greeting: string;
  intro: string;
  footer_note: string;
  accent_color: string;
  show_line_items: boolean;
  show_payment_details: boolean;
  show_buttons: boolean;
  custom_html: string;
}

function formFromSummary(s: EmailTemplateSummary): FormState {
  return {
    subject: s.resolved.subject,
    greeting: s.resolved.greeting,
    intro: s.resolved.intro,
    footer_note: s.resolved.footer_note,
    accent_color: s.resolved.accent_color,
    show_line_items: s.resolved.show_line_items,
    show_payment_details: s.resolved.show_payment_details,
    show_buttons: s.resolved.show_buttons,
    custom_html: s.resolved.custom_html ?? "",
  };
}

export function EmailTemplatesClient({ initial }: Props) {
  const router = useRouter();
  // The scrim has to outlast the refresh: a local `finally { setBusy(false) }`
  // fires when refresh() is CALLED, not when the server output arrives.
  const { refresh } = useTrackedRefresh();
  const [active, setActive] = useState<EmailTemplateType>(initial[0]?.type ?? "invoice");
  const summary = initial.find((s) => s.type === active)!;

  const [form, setForm] = useState<FormState>(() => formFromSummary(summary));
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [previewSubject, setPreviewSubject] = useState<string>("");
  const [isSaving, startSaving] = useTransition();
  const [isResetting, startResetting] = useTransition();
  const [isPreviewing, startPreviewing] = useTransition();
  const previewSeq = useRef(0);

  // Switching template type reloads that type's resolved values.
  useEffect(() => {
    const s = initial.find((x) => x.type === active);
    if (s) setForm(formFromSummary(s));
    setPreviewHtml("");
    setPreviewSubject("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, initial]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const runPreview = () => {
    const seq = ++previewSeq.current;
    startPreviewing(async () => {
      try {
        const { subject, html } = await previewEmailTemplate(active, {
          ...form,
          custom_html: form.custom_html.trim() === "" ? null : form.custom_html,
        });
        if (seq === previewSeq.current) {
          setPreviewSubject(subject);
          setPreviewHtml(html);
        }
      } catch {
        toast.error("Preview failed");
      }
    });
  };

  const handleSave = () => {
    startSaving(async () => {
      try {
        // Fields equal to the default are stored as overrides too — harmless,
        // and it keeps "what you see is what is saved" simple.
        await saveEmailTemplate(active, {
          ...form,
          custom_html: form.custom_html.trim() === "" ? null : form.custom_html,
        });
        toast.success("Template saved");
        refresh();
      } catch {
        toast.error("Failed to save template");
      }
    });
  };

  const handleReset = () => {
    startResetting(async () => {
      try {
        await resetEmailTemplate(active);
        const d = summary.defaults;
        setForm({
          subject: d.subject, greeting: d.greeting, intro: d.intro,
          footer_note: d.footer_note, accent_color: d.accent_color,
          show_line_items: d.show_line_items, show_payment_details: d.show_payment_details,
          show_buttons: d.show_buttons, custom_html: "",
        });
        toast.success("Template reset to default");
        refresh();
      } catch {
        toast.error("Failed to reset template");
      }
    });
  };

  const showsLineItems = active === "invoice" || active === "quote";
  const showsPayment = active === "invoice";

  return (
    <div>
      <PageHeader
        title="Email templates"
        subtitle="Customise the emails sent to customers and your team"
      />

      <Tabs value={active} onValueChange={(v) => setActive(v as EmailTemplateType)}>
        <TabsList className="bg-transparent p-0 h-auto border-b border-border w-full justify-start gap-0 rounded-none mb-5 overflow-x-auto whitespace-nowrap">
          {initial.map((s) => (
            <TabsTrigger
              key={s.type}
              value={s.type}
              className="rounded-none border-b-2 border-transparent bg-transparent px-3.5 py-2 text-[13px] font-medium text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:font-semibold data-[state=active]:shadow-none -mb-px gap-1.5"
            >
              <Mail className="w-3.5 h-3.5" />
              {s.label}
              {s.customised && <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-primary" title="Customised" />}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        {/* ── Editor ── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{summary.label}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="subject">Subject line</Label>
              <Input id="subject" value={form.subject} onChange={(e) => set("subject", e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="greeting">Greeting</Label>
              <Input id="greeting" value={form.greeting} onChange={(e) => set("greeting", e.target.value)} placeholder="Hi {{customer_name}}," />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="intro">Intro text</Label>
              <Textarea id="intro" rows={3} value={form.intro} onChange={(e) => set("intro", e.target.value)} />
              <p className="text-[11px] text-muted-foreground">Basic HTML allowed (e.g. &lt;strong&gt;).</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="footer">Footer note</Label>
              <Textarea id="footer" rows={2} value={form.footer_note} onChange={(e) => set("footer_note", e.target.value)} placeholder="e.g. Thanks for your business — we appreciate it!" />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="accent">Accent colour</Label>
              <div className="flex items-center gap-2">
                <input
                  id="accent"
                  type="color"
                  value={/^#[0-9a-f]{6}$/i.test(form.accent_color) ? form.accent_color : "#3b82f6"}
                  onChange={(e) => set("accent_color", e.target.value)}
                  className="h-9 w-12 rounded-md border border-border bg-transparent p-1 cursor-pointer"
                />
                <Input className="w-32" value={form.accent_color} onChange={(e) => set("accent_color", e.target.value)} />
              </div>
            </div>

            <div className="space-y-3 pt-1">
              {showsLineItems && (
                <div className="flex items-center justify-between">
                  <Label htmlFor="t-li" className="font-normal">Show line items table</Label>
                  <Switch id="t-li" checked={form.show_line_items} onCheckedChange={(v) => set("show_line_items", v)} />
                </div>
              )}
              {showsPayment && (
                <div className="flex items-center justify-between">
                  <Label htmlFor="t-pay" className="font-normal">Show bank payment details</Label>
                  <Switch id="t-pay" checked={form.show_payment_details} onCheckedChange={(v) => set("show_payment_details", v)} />
                </div>
              )}
              <div className="flex items-center justify-between">
                <Label htmlFor="t-btn" className="font-normal">Show action buttons</Label>
                <Switch id="t-btn" checked={form.show_buttons} onCheckedChange={(v) => set("show_buttons", v)} />
              </div>
            </div>

            <div className="space-y-1.5 pt-1">
              <Label htmlFor="custom">Custom HTML body <span className="text-muted-foreground font-normal">(advanced — replaces the whole layout)</span></Label>
              <Textarea
                id="custom"
                rows={6}
                value={form.custom_html}
                onChange={(e) => set("custom_html", e.target.value)}
                placeholder="Leave empty to use the standard layout above"
                className="font-mono text-xs"
              />
            </div>

            <div className="rounded-lg bg-muted/50 border border-border p-3">
              <p className="text-xs font-medium mb-1.5">Available variables</p>
              <div className="flex flex-wrap gap-1.5">
                {summary.variables.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => { navigator.clipboard.writeText(`{{${v}}}`); toast.success(`Copied {{${v}}}`); }}
                    className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-background border border-border hover:border-primary transition-colors cursor-pointer"
                    title="Click to copy"
                  >
                    {`{{${v}}}`}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
                Save template
              </Button>
              <Button variant="outline" onClick={runPreview} disabled={isPreviewing}>
                {isPreviewing ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Eye className="w-4 h-4 mr-1.5" />}
                Preview
              </Button>
              {summary.customised && (
                <Button variant="ghost" onClick={handleReset} disabled={isResetting} className="ml-auto text-muted-foreground">
                  {isResetting ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <RotateCcw className="w-4 h-4 mr-1.5" />}
                  Reset to default
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ── Preview ── */}
        <Card className="lg:sticky lg:top-4">
          <CardHeader>
            <CardTitle className="text-base">Preview</CardTitle>
            {previewSubject && (
              <p className="text-xs text-muted-foreground mt-1">
                <span className="font-medium text-foreground">Subject:</span> {previewSubject}
              </p>
            )}
          </CardHeader>
          <CardContent>
            {previewHtml ? (
              <iframe
                title="Email preview"
                srcDoc={previewHtml}
                sandbox=""
                className="w-full h-[640px] rounded-lg border border-border bg-white"
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-[320px] text-muted-foreground text-sm gap-2">
                <Eye className="w-6 h-6 opacity-40" />
                Click “Preview” to render this template with sample data
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
