import {
  Document, Page, Text, View, StyleSheet, Image,
} from "@react-pdf/renderer";

export interface PhotoAnalysis {
  caption: string;
  dataUrl: string; // base64 data URL
}

export interface ReportSection {
  heading: string;
  severity: "CRITICAL" | "SIGNIFICANT" | "MINOR" | "ADVISORY";
  bullets: string[];
}

export interface RoofInspectionReportData {
  propertyAddress: string;
  inspectionDate: string;       // e.g. "13 April 2026"
  referenceNumber: string;      // e.g. "CRQ-2026-0413-587HS"
  executiveSummary: string;
  scope: string;
  sections: ReportSection[];
  recommendations: string[];
  paintingNote: string;
  photos: PhotoAnalysis[];
  logoUrl?: string;             // base64 logo
}

const GOLD  = "#B8964A";
const DARK  = "#1A1A1A";
const MID   = "#444444";
const LIGHT = "#F5F0E8";
const RED   = "#C0392B";
const AMBER = "#E67E22";

const s = StyleSheet.create({
  page:         { fontFamily: "Helvetica", fontSize: 10, color: MID, paddingTop: 80, paddingBottom: 60, paddingHorizontal: 45 },
  header:       { position: "absolute", top: 16, left: 45, right: 45, flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 1, borderBottomColor: GOLD, paddingBottom: 8 },
  headerLogo:   { width: 90, height: 36, objectFit: "contain" },
  headerRight:  { fontSize: 7, color: MID, textAlign: "right", lineHeight: 1.5 },
  headerGold:   { color: GOLD },
  footer:       { position: "absolute", bottom: 20, left: 45, right: 45, borderTopWidth: 1, borderTopColor: "#E0D8C8", paddingTop: 6, textAlign: "center", fontSize: 7, color: "#888" },

  // Banner
  banner:       { backgroundColor: DARK, padding: 16, marginBottom: 14, alignItems: "center" },
  bannerTitle:  { color: GOLD, fontSize: 20, fontFamily: "Helvetica-Bold", letterSpacing: 1, marginBottom: 3 },
  bannerSub:    { color: "#CCCCCC", fontSize: 11 },

  // Details table
  detTable:     { marginBottom: 12 },
  detRow:       { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#E0D8C8" },
  detLabel:     { width: 140, backgroundColor: LIGHT, padding: 5, fontFamily: "Helvetica-Bold", fontSize: 9, color: DARK },
  detValue:     { flex: 1, padding: 5, fontSize: 9, color: MID },

  // Sections
  hr:           { borderBottomWidth: 1.5, borderBottomColor: GOLD, marginVertical: 10 },
  heading:      { fontSize: 13, fontFamily: "Helvetica-Bold", color: GOLD, marginBottom: 6, marginTop: 14 },
  subheading:   { fontSize: 11, fontFamily: "Helvetica-Bold", color: DARK, marginTop: 10, marginBottom: 4 },
  body:         { fontSize: 9.5, color: MID, lineHeight: 1.6, marginBottom: 5 },
  bullet:       { fontSize: 9.5, color: MID, lineHeight: 1.5, marginLeft: 12, marginBottom: 2 },
  bulletDot:    { color: GOLD, marginRight: 4 },

  // Risk table
  riskTable:    { marginVertical: 10 },
  riskHeader:   { flexDirection: "row", backgroundColor: DARK },
  riskRow:      { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#E0D8C8" },
  riskCell:     { flex: 3, padding: 5, fontSize: 9, color: MID },
  riskCellSm:   { flex: 1.5, padding: 5, fontSize: 9, color: MID, textAlign: "center" },
  riskHCell:    { fontSize: 9, fontFamily: "Helvetica-Bold", color: GOLD, textAlign: "center", padding: 5 },
  riskHCellL:   { fontSize: 9, fontFamily: "Helvetica-Bold", color: GOLD, padding: 5 },

  // Photos
  photoWrap:    { marginBottom: 18, alignItems: "center" },
  photoLabel:   { color: GOLD, fontSize: 9, fontFamily: "Helvetica-Bold", marginBottom: 4, alignSelf: "flex-start" },
  photoImg:     { width: 420, height: 280, objectFit: "cover", marginBottom: 5 },
  photoCaption: { fontSize: 8.5, color: MID, fontFamily: "Helvetica-Oblique", textAlign: "center", maxWidth: 420 },

  italic:       { fontFamily: "Helvetica-Oblique" },
});

function HR() { return <View style={s.hr} />; }

function Heading({ children }: { children: string }) {
  return <Text style={s.heading}>{children}</Text>;
}

function Body({ children }: { children: string }) {
  return <Text style={s.body}>{children}</Text>;
}

function Bullet({ children }: { children: string }) {
  return (
    <View style={{ flexDirection: "row", marginLeft: 10, marginBottom: 2 }}>
      <Text style={{ color: GOLD, fontSize: 9.5, marginRight: 4 }}>•</Text>
      <Text style={s.bullet}>{children}</Text>
    </View>
  );
}

function RiskBadge({ level }: { level: string }) {
  const color = level === "HIGH" ? RED : level === "MEDIUM" ? AMBER : MID;
  return <Text style={{ ...s.riskCellSm, color, fontFamily: "Helvetica-Bold" }}>{level}</Text>;
}

export function RoofInspectionPDF({ data, logoBase64 }: { data: RoofInspectionReportData; logoBase64?: string }) {
  const riskRows = data.sections.map((sec) => ({
    deficiency: sec.heading,
    level: sec.severity === "CRITICAL" ? "HIGH" : sec.severity === "SIGNIFICANT" ? "MEDIUM" : "LOW",
    urgency: sec.severity === "CRITICAL" ? "Immediate" : sec.severity === "SIGNIFICANT" ? "Within 3 months" : "Monitor",
  }));

  return (
    <Document title={`Roof Inspection Report — ${data.propertyAddress}`} author="Crown Roofers">
      <Page size="A4" style={s.page} wrap>
        {/* Header */}
        <View style={s.header} fixed>
          {logoBase64 ? (
            <Image style={s.headerLogo} src={logoBase64} />
          ) : (
            <Text style={{ fontSize: 11, fontFamily: "Helvetica-Bold", color: GOLD }}>CROWN ROOFERS</Text>
          )}
          <View style={{ alignItems: "flex-end" }}>
            <Text style={s.headerRight}>Ph: 0490 688 332  |  info@crownroofers.com.au</Text>
            <Text style={{ ...s.headerRight, ...s.headerGold }}>crownroofers.com.au</Text>
            <Text style={s.headerRight}>Licence No: 471250C  |  ABN: 33 667 304 234</Text>
          </View>
        </View>

        {/* Footer */}
        <Text style={s.footer} fixed render={({ pageNumber, totalPages }) =>
          `Crown Roofers  |  Ph: 0490 688 332  |  info@crownroofers.com.au  |  crownroofers.com.au  |  Page ${pageNumber} of ${totalPages}`
        } />

        {/* Title banner */}
        <View style={s.banner}>
          <Text style={s.bannerTitle}>ROOF INSPECTION REPORT</Text>
          <Text style={s.bannerSub}>Roof Condition Assessment &amp; Restoration Scope</Text>
        </View>

        {/* Property details */}
        <View style={s.detTable}>
          {[
            ["Property Address", data.propertyAddress],
            ["Inspection Date",  data.inspectionDate],
            ["Prepared By",      "Crown Roofers"],
            ["Report Reference", data.referenceNumber],
          ].map(([label, value]) => (
            <View key={label} style={s.detRow}>
              <Text style={s.detLabel}>{label}</Text>
              <Text style={s.detValue}>{value}</Text>
            </View>
          ))}
        </View>

        <HR />

        {/* 1. Executive Summary */}
        <Heading>1.  Executive Summary</Heading>
        <Body>{data.executiveSummary}</Body>
        <HR />

        {/* 2. Property & Scope */}
        <Heading>2.  Property &amp; Scope of Inspection</Heading>
        <Body>{data.scope}</Body>
        <HR />

        {/* 3. Detailed Findings */}
        <Heading>3.  Detailed Inspection Findings</Heading>
        <Body>The following deficiencies were identified during the inspection. Each deficiency is evidenced by the photographic record in Section 6.</Body>
        {data.sections.map((sec, i) => (
          <View key={i}>
            <Text style={s.subheading}>3.{i + 1}  {sec.heading} — {sec.severity}</Text>
            {sec.bullets.map((b, j) => <Bullet key={j}>{b}</Bullet>)}
          </View>
        ))}
        <HR />

        {/* 4. Risk Assessment */}
        <Heading>4.  Risk Assessment</Heading>
        <View style={s.riskTable}>
          <View style={s.riskHeader}>
            <Text style={{ ...s.riskHCellL, flex: 3 }}>Deficiency</Text>
            <Text style={{ ...s.riskHCell, flex: 1.5 }}>Risk Level</Text>
            <Text style={{ ...s.riskHCell, flex: 1.5 }}>Urgency</Text>
          </View>
          {riskRows.map((row, i) => (
            <View key={i} style={s.riskRow}>
              <Text style={s.riskCell}>{row.deficiency}</Text>
              <RiskBadge level={row.level} />
              <Text style={{ ...s.riskCellSm, textAlign: "center" }}>{row.urgency}</Text>
            </View>
          ))}
        </View>
        <HR />

        {/* 5. Recommendations */}
        <Heading>5.  Recommendations &amp; Scope of Works</Heading>
        <Text style={s.subheading}>5.1  Repairs &amp; Restoration</Text>
        {data.recommendations.map((r, i) => <Bullet key={i}>{r}</Bullet>)}
        <Text style={s.subheading}>5.2  Cleaning &amp; Painting Note</Text>
        <Body>{data.paintingNote}</Body>
        <Text style={s.subheading}>5.3  Warranty</Text>
        <Body>Upon completion of the full roof restoration scope, Crown Roofers will provide a 30-year warranty covering all restoration works carried out.</Body>
        <HR />

        {/* 6. Photographic Record */}
        <Heading>6.  Photographic Record</Heading>
        <Body>{`The following ${data.photos.length} photograph${data.photos.length !== 1 ? "s were" : " was"} captured on-site at ${data.propertyAddress} on ${data.inspectionDate}.`}</Body>

        {data.photos.map((photo, i) => (
          <View key={i} style={s.photoWrap} break={i > 0 && i % 2 === 0}>
            <Text style={s.photoLabel}>Photo {i + 1} of {data.photos.length}</Text>
            <Image style={s.photoImg} src={photo.dataUrl} />
            <Text style={s.photoCaption}>Figure {i + 1}: {photo.caption}</Text>
          </View>
        ))}

        <HR />

        {/* 7. Disclaimer */}
        <Heading>7.  Disclaimer</Heading>
        <Body>
          This report has been prepared based on a visual inspection of accessible roof areas conducted on the date stated. It is not a structural engineering report. Hidden or concealed defects not visible at the time of inspection are not covered by this report. Crown Roofers accepts no liability for defects or conditions that could not be reasonably identified during a visual inspection. This report is intended solely for the use of the property owner or their authorised representative in connection with the assessment of roof condition and proposed remedial works.
        </Body>
      </Page>
    </Document>
  );
}
