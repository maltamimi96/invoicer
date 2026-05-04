import { getBusinessAnalytics, type AnalyticsRange } from "@/lib/actions/analytics";
import { AnalyticsClient } from "@/components/analytics/analytics-client";

const RANGES: AnalyticsRange[] = ["30d", "90d", "12m", "ytd"];

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const sp = await searchParams;
  const range = (RANGES.includes(sp.range as AnalyticsRange) ? sp.range : "90d") as AnalyticsRange;
  const data = await getBusinessAnalytics(range);

  return <AnalyticsClient data={data} range={range} />;
}
