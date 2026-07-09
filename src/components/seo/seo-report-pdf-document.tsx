import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });
}

interface Ranking { keyword: string; from: number | null; to: number | null; change: number | null; clicks: number; impressions: number }
interface Report {
  title: string | null;
  period_start: string;
  period_end: string;
  metrics: { rankings?: Ranking[]; totalClicks?: number; totalImpressions?: number; trackedKeywords?: number };
  work_log: { contentShipped?: { title: string; url: string | null }[]; opportunitiesDone?: { title: string; type: string }[] };
  plan: { next?: { title: string; type: string }[] };
}
interface Props {
  report: Report;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  business: any;
  siteDomain: string;
  clientName?: string | null;
}

export function SeoReportPDFDocument({ report, business, siteDomain, clientName }: Props) {
  const primary: string = business?.pdf_settings?.primary_color ?? "#047857";
  const logo: string | null = business?.pdf_settings?.logo_url ?? business?.logo_url ?? null;
  const muted = "#64748b", border = "#e2e8f0", text = "#0f172a";

  const s = StyleSheet.create({
    page: { padding: 40, fontSize: 10, color: text, fontFamily: "Helvetica" },
    row: { flexDirection: "row" },
    between: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
    brand: { fontSize: 16, fontFamily: "Helvetica-Bold", color: primary },
    h1: { fontSize: 18, fontFamily: "Helvetica-Bold", marginBottom: 2 },
    h2: { fontSize: 12, fontFamily: "Helvetica-Bold", color: primary, marginTop: 20, marginBottom: 8 },
    muted: { color: muted },
    card: { flex: 1, borderWidth: 1, borderColor: border, borderRadius: 6, padding: 10, marginRight: 8 },
    stat: { fontSize: 18, fontFamily: "Helvetica-Bold" },
    th: { flexDirection: "row", borderBottomWidth: 1, borderColor: border, paddingBottom: 4, marginBottom: 4 },
    td: { flexDirection: "row", paddingVertical: 3, borderBottomWidth: 0.5, borderColor: border },
    cKw: { flex: 3 }, cNum: { flex: 1, textAlign: "right" },
    li: { flexDirection: "row", marginBottom: 3 },
    bullet: { width: 10, color: primary },
    foot: { position: "absolute", bottom: 24, left: 40, right: 40, textAlign: "center", fontSize: 8, color: muted },
  });

  const rankings = report.metrics?.rankings ?? [];
  const content = report.work_log?.contentShipped ?? [];
  const oppsDone = report.work_log?.opportunitiesDone ?? [];
  const plan = report.plan?.next ?? [];

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.between}>
          <View>
            {logo ? <Image src={logo} style={{ height: 34, marginBottom: 6 }} /> : <Text style={s.brand}>{business?.name ?? "SEO Report"}</Text>}
            <Text style={s.muted}>{business?.name}</Text>
          </View>
          <View style={{ textAlign: "right" }}>
            <Text style={s.h1}>SEO Report</Text>
            <Text style={s.muted}>{fmtDate(report.period_start)} – {fmtDate(report.period_end)}</Text>
          </View>
        </View>

        <View style={{ marginTop: 14 }}>
          <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 12 }}>{clientName ?? siteDomain}</Text>
          <Text style={s.muted}>{siteDomain}</Text>
        </View>

        {/* Summary */}
        <View style={[s.row, { marginTop: 18 }]}>
          <View style={s.card}><Text style={s.muted}>Tracked keywords</Text><Text style={s.stat}>{report.metrics?.trackedKeywords ?? 0}</Text></View>
          <View style={s.card}><Text style={s.muted}>Clicks</Text><Text style={s.stat}>{report.metrics?.totalClicks ?? 0}</Text></View>
          <View style={s.card}><Text style={s.muted}>Impressions</Text><Text style={s.stat}>{report.metrics?.totalImpressions ?? 0}</Text></View>
          <View style={[s.card, { marginRight: 0 }]}><Text style={s.muted}>Content shipped</Text><Text style={s.stat}>{content.length}</Text></View>
        </View>

        {/* Rankings */}
        <Text style={s.h2}>Rankings movement</Text>
        {rankings.length === 0 ? (
          <Text style={s.muted}>No ranking data for this period yet. Connect Google Search Console to track keyword positions, clicks and impressions.</Text>
        ) : (
          <View>
            <View style={s.th}><Text style={s.cKw}>Keyword</Text><Text style={s.cNum}>From</Text><Text style={s.cNum}>To</Text><Text style={s.cNum}>Change</Text><Text style={s.cNum}>Clicks</Text></View>
            {rankings.map((r, i) => (
              <View style={s.td} key={i}>
                <Text style={s.cKw}>{r.keyword}</Text>
                <Text style={s.cNum}>{r.from ?? "–"}</Text>
                <Text style={s.cNum}>{r.to ?? "–"}</Text>
                <Text style={[s.cNum, { color: (r.change ?? 0) > 0 ? "#047857" : (r.change ?? 0) < 0 ? "#b91c1c" : muted }]}>{r.change == null ? "–" : r.change > 0 ? `+${r.change}` : r.change}</Text>
                <Text style={s.cNum}>{r.clicks}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Work delivered */}
        <Text style={s.h2}>Work delivered</Text>
        {content.length === 0 && oppsDone.length === 0 ? (
          <Text style={s.muted}>No content shipped in this period.</Text>
        ) : (
          <View>
            {content.map((c, i) => (
              <View style={s.li} key={`c${i}`}><Text style={s.bullet}>•</Text><Text>Published: {c.title}{c.url ? ` (${c.url})` : ""}</Text></View>
            ))}
            {oppsDone.map((o, i) => (
              <View style={s.li} key={`o${i}`}><Text style={s.bullet}>•</Text><Text>{o.title}</Text></View>
            ))}
          </View>
        )}

        {/* Plan */}
        <Text style={s.h2}>Plan for next period</Text>
        {plan.length === 0 ? (
          <Text style={s.muted}>Run the Opportunity Scout to build next period&apos;s plan.</Text>
        ) : (
          <View>
            {plan.map((p, i) => (
              <View style={s.li} key={`p${i}`}><Text style={s.bullet}>•</Text><Text>{p.title} <Text style={s.muted}>({p.type.replace("_", " ")})</Text></Text></View>
            ))}
          </View>
        )}

        <Text style={s.foot} fixed>{business?.name} · Prepared {fmtDate(report.period_end)}</Text>
      </Page>
    </Document>
  );
}
