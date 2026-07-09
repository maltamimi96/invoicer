import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";

interface Finding { severity: string; title: string; detail?: string; fix?: string }
interface AuditResult { score?: number; summary?: string; findings?: Finding[] }
interface Props {
  url: string;
  result: AuditResult;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  business: any;
}

const SEV_ORDER = ["critical", "high", "medium", "low"];
const SEV_COLOR: Record<string, string> = { critical: "#b91c1c", high: "#c2410c", medium: "#a16207", low: "#0369a1" };

export function SeoAuditPDFDocument({ url, result, business }: Props) {
  const primary: string = business?.pdf_settings?.primary_color ?? "#047857";
  const logo: string | null = business?.pdf_settings?.logo_url ?? business?.logo_url ?? null;
  const muted = "#64748b", border = "#e2e8f0", text = "#0f172a";
  const score = Math.max(0, Math.min(100, Math.round(result?.score ?? 0)));
  const findings = [...(result?.findings ?? [])].sort((a, b) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity));

  const s = StyleSheet.create({
    page: { padding: 40, fontSize: 10, color: text, fontFamily: "Helvetica" },
    between: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
    brand: { fontSize: 16, fontFamily: "Helvetica-Bold", color: primary },
    h1: { fontSize: 18, fontFamily: "Helvetica-Bold" },
    muted: { color: muted },
    scoreBox: { alignItems: "center", justifyContent: "center", width: 90, height: 90, borderRadius: 45, borderWidth: 4, borderColor: primary },
    scoreNum: { fontSize: 30, fontFamily: "Helvetica-Bold", color: primary },
    h2: { fontSize: 12, fontFamily: "Helvetica-Bold", color: primary, marginTop: 22, marginBottom: 8 },
    finding: { borderWidth: 1, borderColor: border, borderRadius: 6, padding: 10, marginBottom: 8 },
    pill: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#fff", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, alignSelf: "flex-start", textTransform: "uppercase" },
    foot: { position: "absolute", bottom: 24, left: 40, right: 40, textAlign: "center", fontSize: 8, color: muted },
  });

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.between}>
          <View>
            {logo ? <Image src={logo} style={{ height: 32, marginBottom: 6 }} /> : <Text style={s.brand}>{business?.name ?? "SEO Audit"}</Text>}
            <Text style={s.muted}>{business?.name}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={s.h1}>SEO Audit</Text>
            <Text style={s.muted}>{url}</Text>
          </View>
        </View>

        <View style={[s.between, { marginTop: 20, alignItems: "center" }]}>
          <View style={{ flex: 1, paddingRight: 20 }}>
            <Text style={{ fontFamily: "Helvetica-Bold", marginBottom: 4 }}>Summary</Text>
            <Text style={s.muted}>{result?.summary ?? "Audit complete."}</Text>
          </View>
          <View style={s.scoreBox}><Text style={s.scoreNum}>{score}</Text><Text style={{ fontSize: 8, color: muted }}>/ 100</Text></View>
        </View>

        <Text style={s.h2}>Findings ({findings.length})</Text>
        {findings.length === 0 ? (
          <Text style={s.muted}>No significant issues found.</Text>
        ) : findings.map((f, i) => (
          <View style={s.finding} key={i}>
            <Text style={[s.pill, { backgroundColor: SEV_COLOR[f.severity] ?? muted }]}>{f.severity}</Text>
            <Text style={{ fontFamily: "Helvetica-Bold", marginTop: 4 }}>{f.title}</Text>
            {f.detail ? <Text style={{ marginTop: 2 }}>{f.detail}</Text> : null}
            {f.fix ? <Text style={[s.muted, { marginTop: 2 }]}>Fix: {f.fix}</Text> : null}
          </View>
        ))}

        <Text style={s.foot} fixed>Free SEO audit by {business?.name} · Want us to fix these? Get in touch.</Text>
      </Page>
    </Document>
  );
}
