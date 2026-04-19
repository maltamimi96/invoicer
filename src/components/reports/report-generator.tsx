"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ArrowRight, ImagePlus, X, Sparkles, Loader2, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClientSelect } from "@/components/customers/client-select";
import { Card, CardContent } from "@/components/ui/card";
import { createReport, updateReport, updateReportPhotos } from "@/lib/actions/reports";
import { createClient } from "@/lib/supabase/client";
import { ROOF_INSPECTION_SECTIONS } from "@/lib/templates/roof-inspection";
import type { Business, Customer, ReportPhoto, ReportSection } from "@/types/database";
import Link from "next/link";

interface ReportGeneratorProps {
  customers: Customer[];
  business: Business;
  defaultCustomerId?: string;
}

interface SelectedImage {
  file: File;
  preview: string;
}

const GENERATING_MESSAGES = [
  "Uploading site photos...",
  "Analysing roof condition from images...",
  "Writing executive summary...",
  "Generating detailed findings...",
  "Assessing risk levels...",
  "Compiling scope of works...",
  "Finalising report...",
];

export function ReportGenerator({ customers: initialCustomers, business, defaultCustomerId }: ReportGeneratorProps) {
  const [customers, setCustomers] = useState(initialCustomers);
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(1);
  const [generating, setGenerating] = useState(false);
  const [genMessage, setGenMessage] = useState(GENERATING_MESSAGES[0]);
  const [images, setImages] = useState<SelectedImage[]>([]);
  const [reportId, setReportId] = useState<string | null>(null);

  // Step 1 fields
  const [title, setTitle] = useState("Roof Inspection Report");
  const [customerId, setCustomerId] = useState(defaultCustomerId ?? "");
  const [propertyAddress, setPropertyAddress] = useState("");
  const [inspectionDate, setInspectionDate] = useState(new Date().toISOString().split("T")[0]);
  const [reportDate, setReportDate] = useState(new Date().toISOString().split("T")[0]);
  const [roofType, setRoofType] = useState("Terracotta/Concrete Tile");
  const [inspectorName, setInspectorName] = useState(business.name);

  // Step 2 fields
  const [description, setDescription] = useState("");

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const newImages: SelectedImage[] = [];
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith("image/")) return;
      newImages.push({ file, preview: URL.createObjectURL(file) });
    });
    setImages((prev) => [...prev, ...newImages]);
  };

  // ── Step 1: Create report shell + upload images
  const handleStep1 = async () => {
    if (!propertyAddress.trim()) { toast.error("Property address is required"); return; }

    setGenerating(true);
    setGenMessage("Creating report...");

    try {
      // Create the DB row first to get the ID
      const report = await createReport({
        title: `${title} — ${propertyAddress}`,
        customer_id: customerId || null,
        property_address: propertyAddress,
        inspection_date: inspectionDate,
        report_date: reportDate,
        meta: { roof_type: roofType, inspector_name: inspectorName } as never,
      });

      setReportId(report.id);

      // Upload images to Supabase Storage
      if (images.length > 0) {
        setGenMessage("Uploading photos...");
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");

        const photos: ReportPhoto[] = [];

        for (let i = 0; i < images.length; i++) {
          const img = images[i];
          const ext = img.file.name.split(".").pop() ?? "jpg";
          const storagePath = `${user.id}/${report.id}/${crypto.randomUUID()}.${ext}`;

          const { error: uploadError } = await supabase.storage
            .from("report-images")
            .upload(storagePath, img.file, { contentType: img.file.type, upsert: false });

          if (uploadError) {
            console.error("Upload error:", uploadError.message);
            continue;
          }

          const { data: { publicUrl } } = supabase.storage.from("report-images").getPublicUrl(storagePath);

          photos.push({
            id: crypto.randomUUID(),
            url: publicUrl,
            storagePath,
            caption: "",
            order: i + 1,
          });
        }

        if (photos.length > 0) {
          await updateReportPhotos(report.id, photos);
        }
      }

      setGenerating(false);
      setStep(2);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create report");
      setGenerating(false);
    }
  };

  // ── Step 2: Generate full report with AI
  const handleGenerate = async () => {
    if (!reportId) return;

    setGenerating(true);
    let msgIdx = 0;
    setGenMessage(GENERATING_MESSAGES[0]);

    const msgInterval = setInterval(() => {
      msgIdx = Math.min(msgIdx + 1, GENERATING_MESSAGES.length - 1);
      setGenMessage(GENERATING_MESSAGES[msgIdx]);
    }, 2800);

    try {
      // Get saved photo URLs from DB (already uploaded in step 1)
      const { getReport } = await import("@/lib/actions/reports");
      const savedReport = await getReport(reportId);
      const imageUrls = savedReport.photos.map((p) => p.url);

      // Call AI
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "generate_report",
          description,
          imageUrls,
          meta: {
            property_address: propertyAddress,
            inspection_date: inspectionDate,
            roof_type: roofType,
            inspector_name: inspectorName,
          },
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "AI generation failed");
      }

      const { result } = await res.json();

      // Map AI sections into ReportSection array
      const sections: ReportSection[] = ROOF_INSPECTION_SECTIONS.map((tmpl) => ({
        id: tmpl.id,
        title: tmpl.title,
        content: result.sections?.[tmpl.id] ?? "",
      }));

      // Apply photo captions
      const captions: string[] = result.photo_captions ?? [];
      const captionedPhotos: ReportPhoto[] = savedReport.photos.map((p, i) => ({
        ...p,
        caption: captions[i] ?? "",
      }));

      // Build merged meta
      const mergedMeta = {
        ...savedReport.meta,
        advisory_banner: result.meta?.advisory_banner ?? "",
        roof_type: roofType,
        inspector_name: inspectorName,
        roof_features: result.meta?.roof_features ?? "",
        inspection_method: result.meta?.inspection_method ?? savedReport.meta.inspection_method,
        risk_items: result.meta?.risk_items ?? [],
        scope_of_works: result.meta?.scope_of_works ?? [],
        urgency: result.meta?.urgency ?? "",
      };

      await updateReport(reportId, {
        sections,
        photos: captionedPhotos,
        meta: mergedMeta,
        status: "draft",
      });

      clearInterval(msgInterval);
      setGenMessage("Report ready!");
      await new Promise((r) => setTimeout(r, 800));
      router.push(`/reports/${reportId}`);
    } catch (err) {
      clearInterval(msgInterval);
      toast.error(err instanceof Error ? err.message : "Generation failed");
      setGenerating(false);
    }
  };

  if (generating) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-6">
        <div className="relative">
          <div className="w-20 h-20 rounded-2xl bg-purple-50 flex items-center justify-center">
            {genMessage === "Report ready!" ? (
              <CheckCircle className="w-10 h-10 text-purple-500" />
            ) : (
              <Sparkles className="w-10 h-10 text-purple-500 animate-pulse" />
            )}
          </div>
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-xl font-semibold">
            {genMessage === "Report ready!" ? "Report Generated!" : "Generating your report..."}
          </h2>
          <AnimatePresence mode="wait">
            <motion.p
              key={genMessage}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="text-sm text-muted-foreground"
            >
              {genMessage}
            </motion.p>
          </AnimatePresence>
        </div>
        {genMessage !== "Report ready!" && (
          <div className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="w-2 h-2 rounded-full bg-purple-400"
                animate={{ scale: [1, 1.4, 1] }}
                transition={{ repeat: Infinity, duration: 1, delay: i * 0.2 }}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-4">
        <Link href="/reports"><Button variant="ghost" size="icon" className="h-8 w-8"><ArrowLeft className="w-4 h-4" /></Button></Link>
        <div>
          <h1 className="text-2xl font-bold">New Report</h1>
          <p className="text-sm text-muted-foreground">Step {step} of 2</p>
        </div>
      </motion.div>

      {/* Progress */}
      <div className="flex gap-2">
        {[1, 2].map((s) => (
          <div key={s} className={`h-1.5 flex-1 rounded-full transition-colors ${s <= step ? "bg-purple-500" : "bg-muted"}`} />
        ))}
      </div>

      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            {/* Report Details */}
            <Card className="mb-4">
              <CardContent className="p-5 space-y-4">
                <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Report Details</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2 space-y-1.5">
                    <Label>Property Address *</Label>
                    <Input placeholder="102 Blackwall Road, Woy Woy NSW 2256" value={propertyAddress} onChange={(e) => setPropertyAddress(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Client</Label>
                    <ClientSelect
                      customers={customers}
                      value={customerId}
                      onValueChange={setCustomerId}
                      onCustomerCreated={(c) => setCustomers((prev) => [...prev, c])}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Roof Type</Label>
                    <Input placeholder="Terracotta/Concrete Tile" value={roofType} onChange={(e) => setRoofType(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Inspection Date</Label>
                    <Input type="date" value={inspectionDate} onChange={(e) => setInspectionDate(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Report Date</Label>
                    <Input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Inspector Name</Label>
                    <Input placeholder="Inspector name" value={inspectorName} onChange={(e) => setInspectorName(e.target.value)} />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Photo Upload */}
            <Card className="mb-6">
              <CardContent className="p-5 space-y-4">
                <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Site Photos</h3>
                <div
                  className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-purple-400/60 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
                >
                  <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
                  <ImagePlus className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm font-medium">Click or drag photos here</p>
                  <p className="text-xs text-muted-foreground mt-1">Upload all site inspection photos — Claude will analyse them and generate captions</p>
                </div>

                {images.length > 0 && (
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                    {images.map((img, i) => (
                      <div key={i} className="relative group aspect-square">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={img.preview} alt="" className="w-full h-full object-cover rounded-lg border" />
                        <button
                          type="button"
                          className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                        >
                          <X className="w-3 h-3" />
                        </button>
                        <span className="absolute bottom-1 left-1 text-[9px] bg-black/60 text-white rounded px-1">{i + 1}</span>
                      </div>
                    ))}
                  </div>
                )}
                {images.length > 0 && <p className="text-xs text-muted-foreground">{images.length} photo{images.length !== 1 ? "s" : ""} selected</p>}
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button onClick={handleStep1} disabled={!propertyAddress.trim()}>
                Continue <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            </div>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            <Card className="mb-6">
              <CardContent className="p-5 space-y-4">
                <div>
                  <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Inspector&apos;s Notes</h3>
                  <p className="text-xs text-muted-foreground mt-1">Describe your findings, observations, and any specific areas of concern. Claude will use this along with the photos to write the full report.</p>
                </div>
                <Textarea
                  rows={10}
                  placeholder={`Describe what you found during the inspection. For example:\n\n- Overall roof condition: severe deterioration across all surfaces\n- Approximately 30% of tiles cracked or broken\n- Heavy lichen/moss coverage across all roof planes\n- Ridge capping mortar completely failed in multiple sections\n- Valley flashings showing corrosion\n- Solar panel mounting area has cracked tiles around brackets\n- Recommend full replacement rather than repair`}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
                <div className="text-xs text-muted-foreground">
                  {images.length > 0 ? `${images.length} photo${images.length !== 1 ? "s" : ""} uploaded — Claude will analyse each one` : "No photos uploaded — Claude will generate based on your notes only"}
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)}>
                <ArrowLeft className="w-4 h-4 mr-1.5" /> Back
              </Button>
              <Button
                onClick={handleGenerate}
                disabled={!description.trim() && images.length === 0}
                className="gap-1.5 bg-purple-600 hover:bg-purple-700 text-white"
              >
                <Sparkles className="w-4 h-4" />
                Generate Report with AI
              </Button>
            </div>

            <p className="text-xs text-center text-muted-foreground mt-4">
              Claude will generate all {ROOF_INSPECTION_SECTIONS.length} report sections, risk assessment, scope of works and photo captions
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
