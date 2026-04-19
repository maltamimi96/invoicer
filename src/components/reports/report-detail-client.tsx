"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, Download, FileText, Pencil, Check, X, Trash2, CheckCircle, RotateCcw, Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { updateReportSection, updateReportStatus, updateReportPhotos, deleteReport } from "@/lib/actions/reports";
import { ROOF_INSPECTION_SECTIONS, SECTION_MAP } from "@/lib/templates/roof-inspection";
import type { Report, ReportPhoto, Customer, Business, RiskItem } from "@/types/database";
import Link from "next/link";

interface ReportDetailClientProps {
  report: Report & { customers: Customer | null };
  business: Business;
}

const ratingColors: Record<string, string> = {
  Critical: "bg-red-100 text-red-700",
  High: "bg-orange-100 text-orange-700",
  Medium: "bg-yellow-100 text-yellow-700",
  Low: "bg-green-100 text-green-700",
};

export function ReportDetailClient({ report: initialReport, business }: ReportDetailClientProps) {
  const router = useRouter();
  const [report, setReport] = useState(initialReport);
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editingCaption, setEditingCaption] = useState<string | null>(null);
  const [captionContent, setCaptionContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const sectionMap = Object.fromEntries(report.sections.map((s) => [s.id, s]));

  const startEditSection = (id: string) => {
    setEditingSection(id);
    setEditContent(sectionMap[id]?.content ?? "");
  };

  const saveSection = async (id: string) => {
    setSaving(true);
    try {
      await updateReportSection(report.id, id, editContent);
      setReport((prev) => ({
        ...prev,
        sections: prev.sections.map((s) => s.id === id ? { ...s, content: editContent } : s),
      }));
      setEditingSection(null);
      toast.success("Section saved");
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const saveCaption = async (photoId: string) => {
    const updated = report.photos.map((p) => p.id === photoId ? { ...p, caption: captionContent } : p);
    setSaving(true);
    try {
      await updateReportPhotos(report.id, updated);
      setReport((prev) => ({ ...prev, photos: updated }));
      setEditingCaption(null);
      toast.success("Caption saved");
    } catch {
      toast.error("Failed to save caption");
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async () => {
    const newStatus = report.status === "complete" ? "draft" : "complete";
    try {
      await updateReportStatus(report.id, newStatus);
      setReport((prev) => ({ ...prev, status: newStatus }));
      toast.success(newStatus === "complete" ? "Marked as complete" : "Reverted to draft");
    } catch {
      toast.error("Failed to update status");
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteReport(report.id);
      toast.success("Report deleted");
      router.push("/reports");
    } catch {
      toast.error("Failed to delete");
      setDeleting(false);
    }
  };

  const m = report.meta;

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-4 flex-wrap">
        <Link href="/reports"><Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0"><ArrowLeft className="w-4 h-4" /></Button></Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold truncate">{report.title}</h1>
            <Badge className={report.status === "complete" ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}>
              {report.status}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">{report.property_address}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={toggleStatus}>
            {report.status === "complete" ? <><RotateCcw className="w-3.5 h-3.5 mr-1.5" />Back to Draft</> : <><CheckCircle className="w-3.5 h-3.5 mr-1.5" />Mark Complete</>}
          </Button>
          <a href={`/api/pdf/report/${report.id}`} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm"><Download className="w-3.5 h-3.5 mr-1.5" />PDF</Button>
          </a>
          <a href={`/api/docx/report/${report.id}`} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm"><FileText className="w-3.5 h-3.5 mr-1.5" />DOCX</Button>
          </a>
          <Button variant="outline" size="sm" onClick={() => toast.info("Email coming soon")}>
            <Mail className="w-3.5 h-3.5 mr-1.5" />Email
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" disabled={deleting}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete report?</AlertDialogTitle>
                <AlertDialogDescription>This permanently deletes the report and all photos. Cannot be undone.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={handleDelete}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">

          {/* Cover Info */}
          {m.advisory_banner && (
            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-r-lg">
              <p className="text-sm font-semibold text-yellow-800">ADVISORY: {m.advisory_banner}</p>
            </div>
          )}

          {/* Executive Summary */}
          <SectionEditor
            id="executive_summary"
            numbering="1"
            title="Executive Summary"
            content={sectionMap["executive_summary"]?.content ?? ""}
            editing={editingSection === "executive_summary"}
            editContent={editContent}
            saving={saving}
            onEdit={() => startEditSection("executive_summary")}
            onCancel={() => setEditingSection(null)}
            onSave={() => saveSection("executive_summary")}
            onEditContent={setEditContent}
          />

          {/* Property & Scope */}
          <Card>
            <CardContent className="p-5 space-y-3">
              <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">2 · Property & Scope of Inspection</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                {[
                  ["Property Address", report.property_address],
                  ["Roof Type", m.roof_type],
                  ["Roof Features", m.roof_features],
                  ["Inspection Method", m.inspection_method],
                  ["Inspector", m.inspector_name],
                  ["Inspection Date", report.inspection_date],
                ].map(([k, v]) => (
                  <div key={k}>
                    <span className="text-muted-foreground text-xs">{k}</span>
                    <p className="font-medium">{v || "—"}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Detailed Findings */}
          <div>
            <h3 className="font-semibold text-base mb-3 text-muted-foreground uppercase tracking-wide text-sm">3 · Detailed Inspection Findings</h3>
            <div className="space-y-3">
              {ROOF_INSPECTION_SECTIONS.slice(1).map((tmpl) => (
                <SectionEditor
                  key={tmpl.id}
                  id={tmpl.id}
                  numbering={tmpl.numbering}
                  title={tmpl.title}
                  content={sectionMap[tmpl.id]?.content ?? ""}
                  editing={editingSection === tmpl.id}
                  editContent={editContent}
                  saving={saving}
                  onEdit={() => startEditSection(tmpl.id)}
                  onCancel={() => setEditingSection(null)}
                  onSave={() => saveSection(tmpl.id)}
                  onEditContent={setEditContent}
                />
              ))}
            </div>
          </div>

          {/* Risk Assessment */}
          {m.risk_items?.length > 0 && (
            <Card>
              <CardContent className="p-5 space-y-3">
                <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">4 · Risk Assessment</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-800 text-white">
                        <th className="text-left p-2 rounded-tl font-medium text-xs">Defect</th>
                        <th className="text-left p-2 font-medium text-xs">Likelihood</th>
                        <th className="text-left p-2 font-medium text-xs">Consequence</th>
                        <th className="text-left p-2 rounded-tr font-medium text-xs">Rating</th>
                      </tr>
                    </thead>
                    <tbody>
                      {m.risk_items.map((item: RiskItem, i: number) => (
                        <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                          <td className="p-2 text-xs">{item.defect}</td>
                          <td className="p-2 text-xs">{item.likelihood}</td>
                          <td className="p-2 text-xs">{item.consequence}</td>
                          <td className="p-2">
                            <Badge className={`text-xs ${ratingColors[item.rating] ?? "bg-gray-100 text-gray-700"}`}>{item.rating}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recommendation */}
          {(m.scope_of_works?.length > 0 || m.urgency) && (
            <Card>
              <CardContent className="p-5 space-y-4">
                <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">5 · Recommendation</h3>
                {m.scope_of_works?.length > 0 && (
                  <div>
                    <p className="text-sm font-semibold mb-2">5.1 Recommended Scope of Works</p>
                    <ol className="space-y-1.5">
                      {m.scope_of_works.map((item, i) => (
                        <li key={i} className="text-sm flex gap-2">
                          <span className="font-semibold text-muted-foreground flex-shrink-0">{i + 1}.</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
                {m.urgency && (
                  <div>
                    <p className="text-sm font-semibold mb-1">5.2 Urgency</p>
                    <p className="text-sm text-muted-foreground">{m.urgency}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Photographic Record */}
          {report.photos?.length > 0 && (
            <Card>
              <CardContent className="p-5 space-y-4">
                <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">6 · Photographic Record ({report.photos.length} photos)</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {report.photos.map((photo: ReportPhoto) => (
                    <div key={photo.id} className="space-y-1.5">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photo.url} alt={photo.caption} className="w-full aspect-[4/3] object-cover rounded-lg border" />
                      <p className="text-[10px] font-semibold text-muted-foreground">Photo {photo.order} of {report.photos.length}</p>
                      {editingCaption === photo.id ? (
                        <div className="space-y-1">
                          <Textarea rows={2} className="text-xs" value={captionContent} onChange={(e) => setCaptionContent(e.target.value)} />
                          <div className="flex gap-1">
                            <Button size="sm" className="h-6 text-xs px-2" disabled={saving} onClick={() => saveCaption(photo.id)}>
                              {saving ? <Loader className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                            </Button>
                            <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => setEditingCaption(null)}>
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <p
                          className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors group"
                          onClick={() => { setEditingCaption(photo.id); setCaptionContent(photo.caption); }}
                          title="Click to edit caption"
                        >
                          {photo.caption || <span className="italic text-muted-foreground/50">Click to add caption</span>}
                          <Pencil className="w-2.5 h-2.5 inline ml-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <Card>
            <CardContent className="p-5 space-y-3">
              <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Report Info</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Status</span><Badge className={report.status === "complete" ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}>{report.status}</Badge></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Photos</span><span>{report.photos?.length ?? 0}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Sections</span><span>{report.sections?.length ?? 0}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Risk items</span><span>{m.risk_items?.length ?? 0}</span></div>
                {report.customers && <><Separator /><div className="flex justify-between"><span className="text-muted-foreground">Client</span><span className="font-medium">{report.customers.name}</span></div></>}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5 space-y-2">
              <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Downloads</h3>
              <a href={`/api/pdf/report/${report.id}`} target="_blank" rel="noopener noreferrer" className="block">
                <Button variant="outline" size="sm" className="w-full justify-start"><Download className="w-3.5 h-3.5 mr-2" />Download PDF</Button>
              </a>
              <a href={`/api/docx/report/${report.id}`} target="_blank" rel="noopener noreferrer" className="block">
                <Button variant="outline" size="sm" className="w-full justify-start"><FileText className="w-3.5 h-3.5 mr-2" />Download DOCX</Button>
              </a>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ── Section Editor Component ──────────────────────────────────────

function Loader({ className }: { className?: string }) {
  return <div className={`border-2 border-current border-t-transparent rounded-full animate-spin ${className}`} />;
}

interface SectionEditorProps {
  id: string;
  numbering: string;
  title: string;
  content: string;
  editing: boolean;
  editContent: string;
  saving: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  onEditContent: (v: string) => void;
}

function SectionEditor({ id, numbering, title, content, editing, editContent, saving, onEdit, onCancel, onSave, onEditContent }: SectionEditorProps) {
  const tmpl = SECTION_MAP[id];
  return (
    <Card className="group">
      <CardContent className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">
            <span className="text-muted-foreground mr-1.5">{numbering} ·</span>{title}
          </h3>
          {!editing && (
            <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity" onClick={onEdit} title="Edit section">
              <Pencil className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>

        {editing ? (
          <div className="space-y-2">
            <Textarea
              rows={8}
              value={editContent}
              onChange={(e) => onEditContent(e.target.value)}
              placeholder={tmpl?.placeholder}
              className="text-sm"
              autoFocus
            />
            <div className="flex gap-2">
              <Button size="sm" disabled={saving} onClick={onSave}>
                {saving ? <Loader className="w-3.5 h-3.5 mr-1.5" /> : <Check className="w-3.5 h-3.5 mr-1.5" />}Save
              </Button>
              <Button size="sm" variant="ghost" onClick={onCancel}><X className="w-3.5 h-3.5 mr-1.5" />Cancel</Button>
            </div>
          </div>
        ) : (
          <p className={`text-sm leading-relaxed whitespace-pre-wrap cursor-pointer hover:bg-muted/30 rounded p-1 -m-1 transition-colors ${!content ? "text-muted-foreground/50 italic" : "text-muted-foreground"}`} onClick={onEdit}>
            {content || `Click to add ${title.toLowerCase()}...`}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
