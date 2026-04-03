import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import type { Business, Customer, Quote, LineItem, PdfSettings } from "@/types/database";
import { DEFAULT_PDF_SETTINGS } from "@/types/database";

interface Props {
  quote: Quote;
  customer: Customer | null;
  business: Business;
  lineItems: LineItem[];
  pdfSettings?: PdfSettings | null;
}

function fmtCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
}

export function QuotePDFDocument({ quote, customer, business, lineItems, pdfSettings }: Props) {
  const settings: PdfSettings = { ...DEFAULT_PDF_SETTINGS, ...(pdfSettings ?? business.pdf_settings ?? {}) };
  const currency = business.currency ?? "AUD";
  const fmt = (n: number) => fmtCurrency(n, currency);
  const accent = settings.primary_color || business.accent_color || "#B8860B";
  const logoSize = settings.logo_size;
  const isClassic = settings.quote_template === "classic";

  const dark = "#111827";
  const midDark = "#374151";
  const border = "#e5e7eb";
  const muted = "#6b7280";
  const white = "#ffffff";
  const lightBg = "#f9f6f0";

  // Derive subtitle: first line item name + site address
  const siteAddress = [customer?.address, customer?.city, customer?.postcode, customer?.country]
    .filter(Boolean)
    .join(", ");
  const firstItemName = lineItems[0]?.name ?? "";
  const subtitle = firstItemName && siteAddress
    ? `${firstItemName} — ${siteAddress}`
    : siteAddress || firstItemName || quote.number;

  // Parse notes and terms into bullet lines
  const noteLines = (quote.notes ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  const termLines = (quote.terms ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  const allNotes = [...noteLines, ...termLines];

  const styles = StyleSheet.create({
    page: {
      fontFamily: "Helvetica",
      fontSize: 9,
      color: dark,
      backgroundColor: white,
      paddingBottom: 56,
    },

    // Fixed footer
    footer: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      borderTopWidth: 1,
      borderTopColor: border,
      paddingVertical: 9,
      paddingHorizontal: 40,
      backgroundColor: white,
    },
    footerText: {
      fontSize: 7.5,
      color: muted,
      textAlign: "center",
      lineHeight: 1.5,
    },

    // Header
    headerWrap: { paddingHorizontal: 40, paddingTop: 32, paddingBottom: 16 },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
    logo: { width: logoSize, height: logoSize * 0.7, objectFit: "contain" },
    headerRight: { textAlign: "right" },
    headerContact: { fontSize: 8, color: muted, lineHeight: 1.7, textAlign: "right" },
    headerLink: { fontSize: 8, color: accent, textAlign: "right", lineHeight: 1.7 },

    // Title band
    titleBand: {
      backgroundColor: dark,
      paddingVertical: 16,
      paddingHorizontal: 40,
      marginBottom: 0,
    },
    titleText: {
      fontSize: 26,
      fontFamily: "Helvetica-Bold",
      color: accent,
      textAlign: "center",
      letterSpacing: 4,
    },

    // Subtitle
    subtitleRow: {
      paddingHorizontal: 40,
      paddingTop: 14,
      paddingBottom: 4,
    },
    subtitleText: {
      textAlign: "center",
      fontSize: 10,
      color: midDark,
    },

    // Content padding wrapper
    body: { paddingHorizontal: 40, paddingTop: 18 },

    // Info section
    infoSection: { flexDirection: "row", justifyContent: "space-between", marginBottom: 18 },
    quoteToBox: {
      backgroundColor: lightBg,
      padding: 14,
      width: "47%",
    },
    quoteToLabel: {
      fontSize: 7.5,
      fontFamily: "Helvetica-Bold",
      color: accent,
      textTransform: "uppercase",
      letterSpacing: 1,
      marginBottom: 6,
    },
    quoteToName: { fontFamily: "Helvetica-Bold", fontSize: 11, marginBottom: 2 },
    quoteToDetail: { fontSize: 9, color: midDark, lineHeight: 1.6 },
    infoRight: { width: "47%", paddingTop: 2 },
    infoRow: { flexDirection: "row", justifyContent: "flex-end", marginBottom: 5, alignItems: "flex-start" },
    infoLabel: { color: muted, fontSize: 9, marginRight: 6 },
    infoValue: { fontFamily: "Helvetica-Bold", fontSize: 9, textAlign: "right" },
    infoValueLg: { fontFamily: "Helvetica-Bold", fontSize: 11, textAlign: "right" },

    // Site address bar
    siteBar: {
      backgroundColor: midDark,
      paddingVertical: 8,
      paddingHorizontal: 12,
      marginBottom: 16,
      flexDirection: "row",
      alignItems: "center",
    },
    siteLabel: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: accent, marginRight: 8 },
    siteAddressText: { fontSize: 9, color: white },

    // Scope of works table
    tableWrap: { marginBottom: 14 },
    tableTitle: {
      backgroundColor: dark,
      paddingVertical: 9,
      paddingHorizontal: 10,
    },
    tableTitleText: {
      fontSize: 11,
      fontFamily: "Helvetica-Bold",
      color: accent,
      textAlign: "center",
    },
    colHeaders: {
      flexDirection: "row",
      backgroundColor: "#f3f4f6",
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderBottomWidth: 1,
      borderBottomColor: border,
    },
    colHeader: {
      fontSize: 8,
      fontFamily: "Helvetica-Bold",
      color: dark,
    },
    tableRow: {
      flexDirection: "row",
      paddingVertical: 7,
      paddingHorizontal: 10,
      borderBottomWidth: 1,
      borderBottomColor: border,
    },
    tableRowAlt: { backgroundColor: "#fafafa" },
    colNum: { width: 20, fontSize: 9 },
    colDesc: { flex: 1, paddingRight: 8 },
    colDescName: { fontSize: 9, fontFamily: "Helvetica-Bold" },
    colDescDetail: { fontSize: 8, color: muted, marginTop: 1 },
    colQty: { width: 46, textAlign: "center", fontSize: 9 },
    colAmt: { width: 82, textAlign: "right", fontSize: 9 },

    // Totals
    totalsWrap: { flexDirection: "row", justifyContent: "flex-end", marginBottom: 18 },
    totalsBox: { width: 240 },
    totalsBorder: { borderTopWidth: 1, borderTopColor: border, marginBottom: 0 },
    totalRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 5,
      paddingHorizontal: 10,
    },
    totalLabel: { fontSize: 9, color: muted },
    totalValue: { fontSize: 9 },
    grandTotalRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 7,
      paddingHorizontal: 10,
      backgroundColor: dark,
    },
    grandTotalLabel: { fontSize: 10, fontFamily: "Helvetica-Bold", color: accent },
    grandTotalValue: { fontSize: 10, fontFamily: "Helvetica-Bold", color: accent },

    // Notes & conditions
    notesBox: {
      borderWidth: 1,
      borderColor: border,
      padding: 14,
      marginBottom: 16,
    },
    notesTitle: { fontSize: 9, fontFamily: "Helvetica-Bold", marginBottom: 8 },
    notesItem: { fontSize: 8.5, color: midDark, lineHeight: 1.7, marginBottom: 2 },

    // Acceptance of quote
    acceptBox: {
      borderWidth: 1,
      borderColor: border,
      padding: 18,
      marginTop: 4,
    },
    acceptTitle: { fontSize: 10, fontFamily: "Helvetica-Bold", marginBottom: 10 },
    acceptText: { fontSize: 9, color: midDark, lineHeight: 1.7, marginBottom: 16 },
    acceptRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      marginBottom: 18,
    },
    acceptLabel: { fontSize: 9, marginRight: 8, minWidth: 72 },
    acceptUnderline: {
      flex: 1,
      borderBottomWidth: 1,
      borderBottomColor: dark,
      height: 18,
    },
    acceptDateLabel: { fontSize: 9, marginLeft: 20, marginRight: 8, minWidth: 32 },
    acceptDateLine: {
      width: 100,
      borderBottomWidth: 1,
      borderBottomColor: dark,
      height: 18,
    },
    acceptSigRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      marginBottom: 18,
    },
    acceptSigLine: {
      width: 200,
      borderBottomWidth: 1,
      borderBottomColor: dark,
      height: 18,
    },
    acceptContact: { fontSize: 9, color: midDark, lineHeight: 1.7 },
  });

  const footerStr = [
    business.name,
    business.phone ? `Ph: ${business.phone}` : null,
    business.email,
    business.website,
  ]
    .filter(Boolean)
    .join(" | ");
  const footerLine2 = business.tax_number ? `ABN: ${business.tax_number}` : null;

  const Header = () => (
    <View style={styles.headerWrap}>
      <View style={styles.header}>
        <View>
          {business.logo_url && <Image src={business.logo_url} style={styles.logo} />}
        </View>
        <View style={styles.headerRight}>
          {(business.phone || business.email) && (
            <Text style={styles.headerContact}>
              {[business.phone ? `Ph: ${business.phone}` : null, business.email]
                .filter(Boolean)
                .join(" | ")}
            </Text>
          )}
          {business.website && <Text style={styles.headerLink}>{business.website}</Text>}
          {business.tax_number && (
            <Text style={styles.headerContact}>ABN: {business.tax_number}</Text>
          )}
        </View>
      </View>
    </View>
  );

  const Footer = () => (
    <View style={styles.footer} fixed>
      <Text style={styles.footerText}>{footerStr}</Text>
      {footerLine2 && <Text style={styles.footerText}>{footerLine2}</Text>}
    </View>
  );

  return (
    <Document>
      {/* ── PAGE 1: Main quote content ── */}
      <Page size="A4" style={styles.page}>
        <Header />

        {/* QUOTATION banner */}
        {!isClassic && (
          <View style={styles.titleBand}>
            <Text style={styles.titleText}>QUOTATION</Text>
          </View>
        )}
        {isClassic && (
          <View style={{ paddingHorizontal: 40, paddingTop: 8, paddingBottom: 4 }}>
            <Text style={{ fontSize: 22, fontFamily: "Helvetica-Bold", color: accent }}>QUOTATION</Text>
          </View>
        )}

        {/* Subtitle */}
        <View style={styles.subtitleRow}>
          <Text style={styles.subtitleText}>{subtitle}</Text>
        </View>

        <View style={styles.body}>
          {/* Quote To + Details */}
          <View style={styles.infoSection}>
            <View style={styles.quoteToBox}>
              <Text style={styles.quoteToLabel}>QUOTE TO:</Text>
              {customer ? (
                <>
                  <Text style={styles.quoteToName}>{customer.name}</Text>
                  {customer.company && <Text style={styles.quoteToDetail}>{customer.company}</Text>}
                  {customer.address && <Text style={styles.quoteToDetail}>{customer.address}</Text>}
                  {customer.city && (
                    <Text style={styles.quoteToDetail}>
                      {customer.city}
                      {customer.postcode ? ` ${customer.postcode}` : ""}
                    </Text>
                  )}
                </>
              ) : (
                <Text style={styles.quoteToDetail}>—</Text>
              )}
            </View>

            <View style={styles.infoRight}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Quote Number:</Text>
                <Text style={styles.infoValueLg}>{quote.number}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Quote Date:</Text>
                <Text style={styles.infoValue}>{fmtDate(quote.issue_date)}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Valid Until:</Text>
                <Text style={styles.infoValue}>{fmtDate(quote.expiry_date)}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Inspector:</Text>
                <Text style={styles.infoValue}>{business.name}</Text>
              </View>
              {business.tax_number && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>ABN:</Text>
                  <Text style={styles.infoValue}>{business.tax_number}</Text>
                </View>
              )}
            </View>
          </View>

          {/* Site address bar */}
          {siteAddress && (
            <View style={styles.siteBar}>
              <Text style={styles.siteLabel}>SITE ADDRESS:</Text>
              <Text style={styles.siteAddressText}>{siteAddress}</Text>
            </View>
          )}

          {/* Scope of works table */}
          <View style={styles.tableWrap}>
            <View style={styles.tableTitle}>
              <Text style={styles.tableTitleText}>SCOPE OF WORKS</Text>
            </View>
            <View style={styles.colHeaders}>
              <Text style={[styles.colHeader, styles.colNum]}>#</Text>
              <Text style={[styles.colHeader, styles.colDesc]}>Description of Works</Text>
              <Text style={[styles.colHeader, styles.colQty]}>Qty</Text>
              <Text style={[styles.colHeader, styles.colAmt]}>Amount ({currency})</Text>
            </View>
            {lineItems.map((item, i) => (
              <View key={item.id} style={[styles.tableRow, i % 2 === 1 ? styles.tableRowAlt : {}]} wrap={false}>
                <Text style={styles.colNum}>{i + 1}</Text>
                <View style={styles.colDesc}>
                  <Text style={styles.colDescName}>{item.name}</Text>
                  {item.description && <Text style={styles.colDescDetail}>{item.description}</Text>}
                </View>
                <Text style={styles.colQty}>{item.quantity}</Text>
                <Text style={styles.colAmt}>
                  {item.total === 0 ? "Included" : fmt(item.total)}
                </Text>
              </View>
            ))}
          </View>

          {/* Totals */}
          <View style={styles.totalsWrap}>
            <View style={styles.totalsBox}>
              <View style={styles.totalsBorder} />
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Subtotal (excl. {settings.label_tax})</Text>
                <Text style={styles.totalValue}>{fmt(quote.subtotal)}</Text>
              </View>
              {quote.discount_amount > 0 && (
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Discount</Text>
                  <Text style={styles.totalValue}>- {fmt(quote.discount_amount)}</Text>
                </View>
              )}
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>{settings.label_tax}</Text>
                <Text style={styles.totalValue}>{fmt(quote.tax_total)}</Text>
              </View>
              <View style={styles.grandTotalRow}>
                <Text style={styles.grandTotalLabel}>TOTAL (incl. {settings.label_tax})</Text>
                <Text style={styles.grandTotalValue}>{fmt(quote.total)} {currency}</Text>
              </View>
            </View>
          </View>

          {/* Notes & Conditions */}
          {allNotes.length > 0 && (
            <View style={styles.notesBox}>
              <Text style={styles.notesTitle}>NOTES &amp; CONDITIONS</Text>
              {allNotes.map((line, i) => (
                <Text key={i} style={styles.notesItem}>• {line}</Text>
              ))}
            </View>
          )}
        </View>

        <Footer />
      </Page>

      {/* ── PAGE 2: Acceptance ── */}
      <Page size="A4" style={styles.page}>
        <Header />
        <View style={styles.body}>
          <View style={styles.acceptBox}>
            <Text style={styles.acceptTitle}>ACCEPTANCE OF QUOTE</Text>
            <Text style={styles.acceptText}>
              I/We accept the above quote and authorise {business.name} to proceed with the works described.
            </Text>
            <View style={styles.acceptRow}>
              <Text style={styles.acceptLabel}>Client Name:</Text>
              <View style={styles.acceptUnderline} />
              <Text style={styles.acceptDateLabel}>Date:</Text>
              <View style={styles.acceptDateLine} />
            </View>
            <View style={styles.acceptSigRow}>
              <Text style={styles.acceptLabel}>Signature:</Text>
              <View style={styles.acceptSigLine} />
            </View>
            {(business.email || business.phone) && (
              <View>
                {business.email && (
                  <Text style={styles.acceptContact}>
                    To accept, please sign and return this document to: {business.email}
                  </Text>
                )}
                {business.phone && (
                  <Text style={styles.acceptContact}>
                    or call {business.phone} to confirm.
                  </Text>
                )}
              </View>
            )}
          </View>
        </View>
        <Footer />
      </Page>
    </Document>
  );
}
