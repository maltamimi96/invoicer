"use client";

import { Button } from "@/components/ui/button";
import { Download } from "@/components/ui/icons";

interface InvoicePDFDownloadProps {
  invoiceId: string;
  invoiceNumber: string;
}

export function InvoicePDFDownload({ invoiceId, invoiceNumber }: InvoicePDFDownloadProps) {
  const handleDownload = () => {
    window.open(`/api/pdf/invoice/${invoiceId}`, "_blank");
  };

  return (
    <Button size="sm" variant="outline" onClick={handleDownload} className="gap-1.5">
      <Download className="w-3.5 h-3.5" />
      Download PDF
    </Button>
  );
}
