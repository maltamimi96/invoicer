"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronRight, ChevronLeft, Check, Sparkles, Hammer, Zap, Building2, X, Plus, Wrench } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { completeQuotingAgentOnboarding, bulkAddKnowledge, type QuotingAgentSettings } from "@/lib/actions/quoting-agent";

interface Props {
  initialSettings: QuotingAgentSettings;
  currency:        string;
}

interface IndustryOption {
  id:    string;
  label: string;
  icon:  React.ReactNode;
}

const INDUSTRIES: IndustryOption[] = [
  { id: "plumbing",            label: "Plumbing",            icon: <Wrench className="w-4 h-4" /> },
  { id: "electrical",          label: "Electrical",          icon: <Zap className="w-4 h-4" /> },
  { id: "carpentry",           label: "Carpentry",           icon: <Hammer className="w-4 h-4" /> },
  { id: "roofing",             label: "Roofing",             icon: <Building2 className="w-4 h-4" /> },
  { id: "painting",            label: "Painting",            icon: <Sparkles className="w-4 h-4" /> },
  { id: "hvac",                label: "HVAC",                icon: <Wrench className="w-4 h-4" /> },
  { id: "landscaping",         label: "Landscaping",         icon: <Hammer className="w-4 h-4" /> },
  { id: "tiling",              label: "Tiling",              icon: <Hammer className="w-4 h-4" /> },
  { id: "general_contracting", label: "General contracting", icon: <Hammer className="w-4 h-4" /> },
];

type EstimationMode = "manual" | "ai_estimate" | "skip";

interface SeedRow {
  kind:     "material" | "labour" | "rate" | "scope_template" | "margin" | "note";
  key:      string;
  value:    string;
  unit:     string;
  category: string;
}

export function QuotingAgentOnboardingClient({ initialSettings, currency }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [pending, startTransition] = useTransition();

  // Step 1: industries
  const [industries, setIndustries] = useState<string[]>(initialSettings.industries ?? []);

  // Step 2: rates
  const [hourly, setHourly]       = useState(initialSettings.default_hourly_rate?.toString() ?? "");
  const [margin, setMargin]       = useState(initialSettings.default_margin_percent?.toString() ?? "30");
  const [tax,    setTax]          = useState(initialSettings.default_tax_rate?.toString() ?? "10");
  const [callOut, setCallOut]     = useState(initialSettings.call_out_fee?.toString() ?? "");
  const [emergencyX, setEmergencyX] = useState(initialSettings.emergency_rate_multiplier?.toString() ?? "1.5");
  const [notes, setNotes]         = useState(initialSettings.business_notes ?? "");

  // Step 3: estimation mode
  const [estimationMode, setEstimationMode] = useState<EstimationMode>(initialSettings.estimation_mode ?? "ai_estimate");

  // Step 4: seed knowledge
  const [seedRows, setSeedRows] = useState<SeedRow[]>([]);

  const toggleIndustry = (id: string) =>
    setIndustries((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const addSeedRow = () =>
    setSeedRows((prev) => [...prev, { kind: "material", key: "", value: "", unit: "", category: industries[0] ?? "" }]);

  const updateSeedRow = (idx: number, patch: Partial<SeedRow>) =>
    setSeedRows((prev) => prev.map((r, i) => i === idx ? { ...r, ...patch } : r));

  const removeSeedRow = (idx: number) =>
    setSeedRows((prev) => prev.filter((_, i) => i !== idx));

  const finish = () => {
    startTransition(async () => {
      try {
        await completeQuotingAgentOnboarding({
          industries,
          default_hourly_rate:      hourly       ? parseFloat(hourly)     : null,
          default_margin_percent:   margin       ? parseFloat(margin)     : null,
          default_tax_rate:         tax          ? parseFloat(tax)        : null,
          call_out_fee:             callOut      ? parseFloat(callOut)    : null,
          emergency_rate_multiplier: emergencyX  ? parseFloat(emergencyX) : null,
          estimation_mode:          estimationMode,
          business_notes:           notes.trim() || null,
        });

        // Seed any rows the user typed in
        const valid = seedRows.filter((r) => r.key.trim() && r.value.trim());
        if (valid.length > 0) {
          await bulkAddKnowledge(valid.map((r) => ({
            kind:     r.kind,
            key:      r.key,
            value:    r.value,
            unit:     r.unit || null,
            category: r.category || null,
            source:   "user",
            confirmed: true,
          })));
        }

        toast.success("Quoting Agent ready");
        router.push("/quoting-agent");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't finish onboarding");
      }
    });
  };

  return (
    <div className="max-w-2xl mx-auto py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 via-fuchsia-500 to-rose-500 flex items-center justify-center text-white">
          <Sparkles className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Set up Quoting Agent</h1>
          <p className="text-sm text-muted-foreground">Teach it how you price. Edit any time.</p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8">
        {[1, 2, 3, 4].map((n) => (
          <div key={n} className={`h-1.5 flex-1 rounded-full ${n <= step ? "bg-primary" : "bg-muted"}`} />
        ))}
      </div>

      {step === 1 && (
        <Card>
          <CardContent className="p-6 space-y-4">
            <div>
              <h2 className="text-lg font-semibold">What do you do?</h2>
              <p className="text-sm text-muted-foreground mt-1">Pick all that apply — the agent uses this to pick the right defaults when estimating.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {INDUSTRIES.map((ind) => {
                const on = industries.includes(ind.id);
                return (
                  <button
                    key={ind.id}
                    onClick={() => toggleIndustry(ind.id)}
                    type="button"
                    className={`inline-flex items-center gap-2 px-3 py-2 rounded-full border text-sm transition-colors ${on
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background border-input hover:bg-muted"}`}
                  >
                    {ind.icon}
                    {ind.label}
                    {on && <Check className="w-3.5 h-3.5" />}
                  </button>
                );
              })}
            </div>

            <div className="flex justify-end pt-4">
              <Button onClick={() => setStep(2)} disabled={industries.length === 0}>
                Continue <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardContent className="p-6 space-y-5">
            <div>
              <h2 className="text-lg font-semibold">Your baseline rates</h2>
              <p className="text-sm text-muted-foreground mt-1">All optional, but the more you fill the less the agent has to guess. You can change these any time.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Hourly rate ({currency})</Label>
                <Input value={hourly} onChange={(e) => setHourly(e.target.value)} placeholder="145" inputMode="decimal" />
              </div>
              <div className="space-y-1.5">
                <Label>Default margin (%)</Label>
                <Input value={margin} onChange={(e) => setMargin(e.target.value)} placeholder="30" inputMode="decimal" />
              </div>
              <div className="space-y-1.5">
                <Label>Tax rate (%)</Label>
                <Input value={tax} onChange={(e) => setTax(e.target.value)} placeholder="10" inputMode="decimal" />
              </div>
              <div className="space-y-1.5">
                <Label>Call-out fee ({currency})</Label>
                <Input value={callOut} onChange={(e) => setCallOut(e.target.value)} placeholder="120" inputMode="decimal" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Emergency / after-hours multiplier (×)</Label>
                <Input value={emergencyX} onChange={(e) => setEmergencyX(e.target.value)} placeholder="1.5" inputMode="decimal" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>House notes — anything the agent should always remember</Label>
                <Textarea
                  rows={3}
                  value={notes} onChange={(e) => setNotes(e.target.value)}
                  placeholder="We always invoice 30% deposit before commencing. We work weekdays only. Quotes valid 30 days."
                />
              </div>
            </div>
            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={() => setStep(1)}>
                <ChevronLeft className="w-4 h-4 mr-1" /> Back
              </Button>
              <Button onClick={() => setStep(3)}>
                Continue <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardContent className="p-6 space-y-5">
            <div>
              <h2 className="text-lg font-semibold">How should the agent handle unknown prices?</h2>
              <p className="text-sm text-muted-foreground mt-1">When you brief the agent on a job and it needs a price it doesn&apos;t have on file…</p>
            </div>
            <div className="space-y-3">
              <ModeCard
                selected={estimationMode === "ai_estimate"}
                onSelect={() => setEstimationMode("ai_estimate")}
                icon={<Sparkles className="w-5 h-5 text-purple-500" />}
                title="Let it estimate"
                description="The agent uses its general knowledge of the industry + your locale to fill in gaps, flags the estimate so you can confirm later. Fastest way to get a quote out."
              />
              <ModeCard
                selected={estimationMode === "manual"}
                onSelect={() => setEstimationMode("manual")}
                icon={<Wrench className="w-5 h-5 text-blue-500" />}
                title="Ask me"
                description="The agent stops and asks you for the price every time it hits an unknown. Slower, but every number is yours."
              />
              <ModeCard
                selected={estimationMode === "skip"}
                onSelect={() => setEstimationMode("skip")}
                icon={<Check className="w-5 h-5 text-emerald-500" />}
                title="Leave blank"
                description="Unknown items get $0 with a 'price tbd' note — you fill them in afterwards. Useful when you'll always quote final prices manually."
              />
            </div>
            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={() => setStep(2)}>
                <ChevronLeft className="w-4 h-4 mr-1" /> Back
              </Button>
              <Button onClick={() => setStep(4)}>
                Continue <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 4 && (
        <Card>
          <CardContent className="p-6 space-y-5">
            <div>
              <h2 className="text-lg font-semibold">Seed the knowledge bank (optional)</h2>
              <p className="text-sm text-muted-foreground mt-1">Add any pricing you want the agent to know up front. You can always teach it more later — or just skip and start chatting.</p>
            </div>

            {seedRows.length === 0 ? (
              <div className="rounded-xl border-dashed border-2 p-6 text-center bg-muted/30">
                <p className="text-sm text-muted-foreground">No facts yet.</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={addSeedRow}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add a price
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {seedRows.map((row, idx) => (
                  <div key={idx} className="grid grid-cols-1 sm:grid-cols-[120px_1fr_120px_90px_120px_auto] gap-2 items-end p-3 rounded-lg border bg-muted/20">
                    <div className="space-y-1">
                      <Label className="text-xs">Kind</Label>
                      <select
                        className="w-full h-9 px-2 rounded-md border bg-background text-sm"
                        value={row.kind}
                        onChange={(e) => updateSeedRow(idx, { kind: e.target.value as SeedRow["kind"] })}
                      >
                        <option value="material">Material</option>
                        <option value="labour">Labour</option>
                        <option value="rate">Rate</option>
                        <option value="margin">Margin</option>
                        <option value="scope_template">Scope</option>
                        <option value="note">Note</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Name / key</Label>
                      <Input value={row.key} onChange={(e) => updateSeedRow(idx, { key: e.target.value })} placeholder="1m copper pipe" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Value</Label>
                      <Input value={row.value} onChange={(e) => updateSeedRow(idx, { value: e.target.value })} placeholder="18.50" inputMode="decimal" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Unit</Label>
                      <Input value={row.unit} onChange={(e) => updateSeedRow(idx, { unit: e.target.value })} placeholder="per m" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Category</Label>
                      <Input value={row.category} onChange={(e) => updateSeedRow(idx, { category: e.target.value })} placeholder="plumbing" />
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => removeSeedRow(idx)} className="text-muted-foreground hover:text-destructive">
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={addSeedRow}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add another
                </Button>
              </div>
            )}

            {estimationMode === "ai_estimate" && (
              <div className="rounded-lg border bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 p-3 flex items-start gap-3">
                <Sparkles className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  <p className="font-medium">You picked &ldquo;Let it estimate&rdquo;</p>
                  <p className="text-muted-foreground mt-1">
                    The agent will fill in missing prices using general knowledge and flag them as estimates. Anything you add here is treated as confirmed.
                  </p>
                </div>
              </div>
            )}

            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={() => setStep(3)}>
                <ChevronLeft className="w-4 h-4 mr-1" /> Back
              </Button>
              <Button onClick={finish} disabled={pending}>
                {pending ? "Saving…" : (
                  <>
                    <Check className="w-4 h-4 mr-1" />
                    Finish — go to Quoting Agent
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary chips at the top once user has selected things */}
      {industries.length > 0 && step > 1 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {industries.map((i) => (
            <Badge key={i} variant="secondary">{i.replace("_", " ")}</Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function ModeCard({ selected, onSelect, icon, title, description }: {
  selected: boolean; onSelect: () => void;
  icon: React.ReactNode; title: string; description: string;
}) {
  return (
    <button type="button" onClick={onSelect}
      className={`w-full text-left p-4 rounded-xl border-2 transition-colors ${selected
        ? "border-primary bg-primary/5"
        : "border-input hover:bg-muted/40"}`}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5">{icon}</div>
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">{title}</h3>
            {selected && <Check className="w-4 h-4 text-primary" />}
          </div>
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        </div>
      </div>
    </button>
  );
}
