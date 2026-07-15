import { Sparkles } from "@/components/ui/icons";
import { BriefingWidget } from "@/components/briefing/briefing-widget";

export default function AssistantPage() {
  return (
    <div>
      <div className="ch-page-header">
        <div>
          <h1 className="ch-page-title flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-primary" />
            Your AI assistant
          </h1>
          <p className="ch-page-subtitle">
            What needs your attention right now — overdue invoices, stale quotes, new leads, and jobs to close out.
          </p>
        </div>
      </div>

      <BriefingWidget />

      <p className="text-[11px] text-muted-foreground/70 mt-4">
        Items refresh from your live data every time you open this page. Snooze to hide for 24h, dismiss to hide until something changes.
      </p>
    </div>
  );
}
