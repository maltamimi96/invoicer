"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { FileText, Plus, Trash2, Download, Eye, ClipboardList } from "@/components/ui/icons";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { deleteReport } from "@/lib/actions/reports";
import type { ReportWithCustomer } from "@/types/database";
import Link from "next/link";

interface ReportsClientProps {
  reports: ReportWithCustomer[];
}

const statusColor: Record<string, string> = {
  draft: "bg-yellow-100 text-yellow-800",
  complete: "bg-green-100 text-green-800",
};

export function ReportsClient({ reports }: ReportsClientProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      await deleteReport(id);
      toast.success("Report deleted");
      router.refresh();
    } catch {
      toast.error("Failed to delete report");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{reports.length} report{reports.length !== 1 ? "s" : ""}</p>
        </div>
        <Link href="/reports/new">
          <Button size="sm"><Plus className="w-4 h-4 mr-1.5" />New Report</Button>
        </Link>
      </motion.div>

      {reports.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
            <ClipboardList className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="font-semibold text-lg mb-1">No reports yet</h3>
          <p className="text-sm text-muted-foreground mb-6 max-w-sm">Generate professional inspection reports with AI — upload site photos and let Claude write the full report.</p>
          <Link href="/reports/new"><Button><Plus className="w-4 h-4 mr-1.5" />Create first report</Button></Link>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {reports.map((report, i) => (
            <motion.div key={report.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
              <Card className="hover:shadow-md transition-shadow">
                <CardContent className="p-5">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                      <FileText className="w-5 h-5 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold truncate">{report.title}</h3>
                        <Badge className={statusColor[report.status]}>{report.status}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{report.property_address ?? "No address"}</p>
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                        {report.inspection_date && <span>Inspection: {report.inspection_date}</span>}
                        {report.customers && <span>· {report.customers.name}</span>}
                        <span>· {report.photos?.length ?? 0} photos</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <Link href={`/reports/${report.id}`}>
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="View report">
                          <Eye className="w-4 h-4" />
                        </Button>
                      </Link>
                      <a href={`/api/pdf/report/${report.id}`} target="_blank" rel="noopener noreferrer">
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Download PDF">
                          <Download className="w-4 h-4" />
                        </Button>
                      </a>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" disabled={deleting === report.id}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete report?</AlertDialogTitle>
                            <AlertDialogDescription>This will permanently delete the report and all associated images. This action cannot be undone.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => handleDelete(report.id)}>Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
