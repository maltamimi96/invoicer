"use client";

import { Button } from "@/components/ui/button";
import { Download } from "@/components/ui/icons";

interface QuotePDFDownloadProps {
  quoteId: string;
  quoteNumber: string;
}

export function QuotePDFDownload({ quoteId, quoteNumber }: QuotePDFDownloadProps) {
  const handleDownload = () => {
    window.open(`/api/pdf/quote/${quoteId}`, "_blank");
  };

  return (
    <Button size="sm" variant="outline" onClick={handleDownload} className="gap-1.5">
      <Download className="w-3.5 h-3.5" />
      Download PDF
    </Button>
  );
}
