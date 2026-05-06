import React from "react";
import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import type { Report } from "@/types/database";
import type { Business } from "@/types/database";
import { ROOF_INSPECTION_SECTIONS } from "@/lib/templates/roof-inspection";

const styles = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 10, color: "#1a1a1a", paddingTop: 80, paddingBottom: 60, paddingHorizontal: 48 },
  // Business header — fixed, repeats on every page
  brandHeader:    { position: "absolute", top: 24, left: 48, right: 48, flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#e5e7eb", paddingBottom: 8 },
  brandLogo:      { width: 90, height: 36, objectFit: "contain" },
  brandName:      { fontSize: 12, fontFamily: "Helvetica-Bold", color: "#1a1a1a" },
  brandContact:   { fontSize: 7.5, color: "#555", textAlign: "right", lineHeight: 1.5 },
  // Cover
  coverTitle: { fontSize: 22, fontFamily: "Helvetica-Bold", marginBottom: 6, color: "#1a1a1a" },
  coverSubtitle: { fontSize: 13, fontFamily: "Helvetica-Bold", marginBottom: 24, color: "#444" },
  coverRow: { flexDirection: "row", marginBottom: 5 },
  coverLabel: { width: 130, fontFamily: "Helvetica-Bold", fontSize: 10, color: "#555" },
  coverValue: { flex: 1, fontSize: 10 },
  advisory: { backgroundColor: "#fef3c7", borderLeft: "4px solid #f59e0b", padding: 10, marginTop: 20, marginBottom: 4 },
  advisoryText: { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#92400e" },
  // Headings
  sectionHeading: { fontSize: 13, fontFamily: "Helvetica-Bold", marginBottom: 8, marginTop: 18, color: "#1a1a1a", borderBottom: "1px solid #e5e7eb", paddingBottom: 4 },
  subHeading: { fontSize: 11, fontFamily: "Helvetica-Bold", marginBottom: 6, marginTop: 14, color: "#374151" },
  // Body
  body: { lineHeight: 1.6, marginBottom: 8, color: "#374151" },
  // Table
  table: { marginTop: 8, marginBottom: 12 },
  tableHeader: { flexDirection: "row", backgroundColor: "#1e293b" },
  tableRow: { flexDirection: "row", borderBottom: "1px solid #e5e7eb" },
  tableRowAlt: { flexDirection: "row", borderBottom: "1px solid #e5e7eb", backgroundColor: "#f8fafc" },
  th: { flex: 1, padding: "6 8", fontSize: 9, fontFamily: "Helvetica-Bold", color: "#fff" },
  td: { flex: 1, padding: "5 8", fontSize: 9, color: "#374151" },
  tdWide: { flex: 2, padding: "5 8", fontSize: 9, color: "#374151" },
  // Rating badges
  ratingCritical: { color: "#dc2626", fontFamily: "Helvetica-Bold" },
  ratingHigh: { color: "#ea580c", fontFamily: "Helvetica-Bold" },
  ratingMedium: { color: "#ca8a04", fontFamily: "Helvetica-Bold" },
  ratingLow: { color: "#16a34a", fontFamily: "Helvetica-Bold" },
  // Photos
  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  photoItem: { width: "47%", marginBottom: 16 },
  photoImage: { width: "100%", height: 160, objectFit: "cover", borderRadius: 3 },
  photoCaption: { fontSize: 8, color: "#6b7280", marginTop: 4 },
  photoNumber: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#374151", marginTop: 2 },
  // Property table
  propTable: { marginTop: 8, marginBottom: 12, border: "1px solid #e5e7eb" },
  propRow: { flexDirection: "row", borderBottom: "1px solid #e5e7eb" },
  propKey: { width: 160, padding: "5 8", backgroundColor: "#f1f5f9", fontSize: 9, fontFamily: "Helvetica-Bold", color: "#374151" },
  propVal: { flex: 1, padding: "5 8", fontSize: 9, color: "#374151" },
  // Scope list
  scopeItem: { flexDirection: "row", marginBottom: 5 },
  scopeNum: { width: 20, fontSize: 9, fontFamily: "Helvetica-Bold", color: "#374151" },
  scopeText: { flex: 1, fontSize: 9, lineHeight: 1.5, color: "#374151" },
  // Header/footer
  pageNumber: { position: "absolute", bottom: 24, right: 48, fontSize: 8, color: "#9ca3af" },
  businessName: { position: "absolute", bottom: 24, left: 48, fontSize: 8, color: "#9ca3af" },
  divider: { borderBottom: "1px solid #e5e7eb", marginVertical: 12 },
});

function ratingStyle(rating: string) {
  if (rating === "Critical") return styles.ratingCritical;
  if (rating === "High") return styles.ratingHigh;
  if (rating === "Medium") return styles.ratingMedium;
  return styles.ratingLow;
}

interface Props {
  report: Report;
  business: Business;
  /** Optional pre-fetched logo as a data URL — react-pdf can't load remote
   *  images reliably from a public URL inside server-rendered streams, so
   *  callers convert the logo to base64 once and pass it in. Falls back to
   *  business.logo_url for client-side rendering. */
  logoDataUrl?: string | null;
}

function BrandHeader({ business, logoDataUrl }: { business: Business; logoDataUrl?: string | null }) {
  const logoSrc = logoDataUrl ?? business.logo_url ?? null;
  const contactLines: string[] = [];
  const contactA: string[] = [];
  if (business.phone) contactA.push(`Ph: ${business.phone}`);
  if (business.email) contactA.push(business.email);
  if (contactA.length) contactLines.push(contactA.join("  |  "));
  if (business.website) contactLines.push(business.website);
  const contactB: string[] = [];
  if (business.license_number) contactB.push(`Licence: ${business.license_number}`);
  if (business.tax_number)     contactB.push(`ABN/VAT: ${business.tax_number}`);
  if (contactB.length) contactLines.push(contactB.join("  |  "));

  return (
    <View style={styles.brandHeader} fixed>
      {logoSrc ? (
        <Image style={styles.brandLogo} src={logoSrc} />
      ) : (
        <Text style={styles.brandName}>{business.name}</Text>
      )}
      <View style={{ alignItems: "flex-end" }}>
        {contactLines.map((line, i) => (
          <Text key={i} style={styles.brandContact}>{line}</Text>
        ))}
      </View>
    </View>
  );
}

export function ReportPdfDocument({ report, business, logoDataUrl }: Props) {
  const m = report.meta;
  const sectionMap = Object.fromEntries(report.sections.map((s) => [s.id, s.content]));
  const inspectorLine = m.inspector_name + (m.inspector_license ? `  (Lic. ${m.inspector_license})` : "");

  return (
    <Document>
      {/* ── COVER PAGE ── */}
      <Page size="A4" style={styles.page}>
        <BrandHeader business={business} logoDataUrl={logoDataUrl} />
        <Text style={styles.coverTitle}>{business.name}</Text>
        <Text style={styles.coverSubtitle}>ROOF INSPECTION REPORT</Text>
        <View style={styles.divider} />
        <View style={styles.coverRow}><Text style={styles.coverLabel}>Property Address:</Text><Text style={styles.coverValue}>{report.property_address}</Text></View>
        <View style={styles.coverRow}><Text style={styles.coverLabel}>Inspection Date:</Text><Text style={styles.coverValue}>{report.inspection_date}</Text></View>
        <View style={styles.coverRow}><Text style={styles.coverLabel}>Report Date:</Text><Text style={styles.coverValue}>{report.report_date}</Text></View>
        <View style={styles.coverRow}><Text style={styles.coverLabel}>Roof Type:</Text><Text style={styles.coverValue}>{m.roof_type}</Text></View>
        <View style={styles.coverRow}><Text style={styles.coverLabel}>Inspector:</Text><Text style={styles.coverValue}>{inspectorLine}</Text></View>
        <View style={styles.coverRow}><Text style={styles.coverLabel}>Report Status:</Text><Text style={styles.coverValue}>{report.status === "complete" ? "FINAL" : "DRAFT"}</Text></View>
        {m.advisory_banner ? (
          <View style={styles.advisory}>
            <Text style={styles.advisoryText}>ADVISORY: {m.advisory_banner}</Text>
          </View>
        ) : null}
        <Text style={styles.businessName}>{business.name}</Text>
        <Text style={styles.pageNumber} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} fixed />
      </Page>

      {/* ── EXECUTIVE SUMMARY + PROPERTY DETAILS ── */}
      <Page size="A4" style={styles.page}>
        <BrandHeader business={business} logoDataUrl={logoDataUrl} />
        <Text style={styles.sectionHeading}>1. Executive Summary</Text>
        <Text style={styles.body}>{sectionMap["executive_summary"] || "—"}</Text>

        <Text style={styles.sectionHeading}>2. Property & Scope of Inspection</Text>
        <View style={styles.propTable}>
          {[
            ["Property Address", report.property_address],
            ["Roof Type", m.roof_type],
            ["Roof Features", m.roof_features],
            ["Inspection Method", m.inspection_method],
            ["Inspector", inspectorLine],
            ["Inspection Date", report.inspection_date],
          ].map(([key, val]) => (
            <View key={key} style={styles.propRow}>
              <Text style={styles.propKey}>{key}</Text>
              <Text style={styles.propVal}>{val || "—"}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.businessName}>{business.name}</Text>
        <Text style={styles.pageNumber} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} fixed />
      </Page>

      {/* ── DETAILED FINDINGS ── */}
      <Page size="A4" style={styles.page}>
        <BrandHeader business={business} logoDataUrl={logoDataUrl} />
        <Text style={styles.sectionHeading}>3. Detailed Inspection Findings</Text>
        {ROOF_INSPECTION_SECTIONS.slice(1).map((tmpl) => (
          <View key={tmpl.id}>
            <Text style={styles.subHeading}>{tmpl.numbering} {tmpl.title}</Text>
            <Text style={styles.body}>{sectionMap[tmpl.id] || "No findings recorded."}</Text>
          </View>
        ))}
        <Text style={styles.businessName}>{business.name}</Text>
        <Text style={styles.pageNumber} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} fixed />
      </Page>

      {/* ── RISK ASSESSMENT + RECOMMENDATION ── */}
      <Page size="A4" style={styles.page}>
        <BrandHeader business={business} logoDataUrl={logoDataUrl} />
        <Text style={styles.sectionHeading}>4. Risk Assessment</Text>
        {m.risk_items?.length > 0 ? (
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={[styles.th, { flex: 2 }]}>Defect</Text>
              <Text style={styles.th}>Likelihood</Text>
              <Text style={styles.th}>Consequence</Text>
              <Text style={styles.th}>Risk Rating</Text>
            </View>
            {m.risk_items.map((item, i) => (
              <View key={i} style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
                <Text style={[styles.td, { flex: 2 }]}>{item.defect}</Text>
                <Text style={styles.td}>{item.likelihood}</Text>
                <Text style={styles.td}>{item.consequence}</Text>
                <Text style={[styles.td, ratingStyle(item.rating)]}>{item.rating}</Text>
              </View>
            ))}
          </View>
        ) : <Text style={styles.body}>No risk items recorded.</Text>}

        <Text style={styles.sectionHeading}>5. Recommendation</Text>
        <Text style={styles.body}>{sectionMap["structural_assessment"] ? "" : ""}</Text>

        <Text style={styles.subHeading}>5.1 Recommended Scope of Works</Text>
        {m.scope_of_works?.map((item, i) => (
          <View key={i} style={styles.scopeItem}>
            <Text style={styles.scopeNum}>{i + 1}.</Text>
            <Text style={styles.scopeText}>{item}</Text>
          </View>
        ))}

        <Text style={styles.subHeading}>5.2 Urgency</Text>
        <Text style={styles.body}>{m.urgency || "—"}</Text>
        <Text style={styles.businessName}>{business.name}</Text>
        <Text style={styles.pageNumber} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} fixed />
      </Page>

      {/* ── PHOTOGRAPHIC RECORD ── */}
      {report.photos?.length > 0 && (
        <Page size="A4" style={styles.page}>
          <BrandHeader business={business} logoDataUrl={logoDataUrl} />
          <Text style={styles.sectionHeading}>6. Photographic Record</Text>
          <Text style={[styles.body, { marginBottom: 12 }]}>
            The following {report.photos.length} photograph{report.photos.length !== 1 ? "s" : ""} were captured on-site at {report.property_address} on {report.inspection_date}.
          </Text>
          <View style={styles.photoGrid}>
            {report.photos.map((photo) => (
              <View key={photo.id} style={styles.photoItem}>
                <Image style={styles.photoImage} src={photo.url} />
                <Text style={styles.photoNumber}>Photo {photo.order} of {report.photos.length}</Text>
                <Text style={styles.photoCaption}>{photo.caption || "Site photograph"}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.businessName}>{business.name}</Text>
          <Text style={styles.pageNumber} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} fixed />
        </Page>
      )}
    </Document>
  );
}
