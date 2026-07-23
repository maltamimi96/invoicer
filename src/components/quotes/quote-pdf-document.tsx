import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import type { Business, Customer, Quote, LineItem, PdfSettings } from "@/types/database";
import type { TemplateConfig, TemplateColumn } from "@/lib/documents/template-config";
import { resolveTemplateConfig, fontFamilyFor, resolvePlaceholders } from "@/lib/documents/template-config";

interface Props {
  quote: Quote;
  customer: Customer | null;
  business: Business;
  lineItems: LineItem[];
  config?: TemplateConfig | null;
  pdfSettings?: PdfSettings | null;
}

function fmtCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(amount);
}
function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
}

export function QuotePDFDocument({ quote, customer, business, lineItems, config, pdfSettings }: Props) {
  const cfg: TemplateConfig = config ?? resolveTemplateConfig({
    pdfSettings: pdfSettings ?? business.pdf_settings ?? null,
    docType: "quote",
  });

  const currency = business.currency ?? "AUD";
  const fmt = (n: number) => fmtCurrency(n, currency);
  const scale = cfg.font_scale || 1;
  const fs = (n: number) => Math.round(n * scale * 10) / 10;

  const fam = fontFamilyFor(cfg.font_family);
  const isHelv = cfg.font_family === "helvetica";
  const bold = isHelv ? { fontFamily: "Helvetica-Bold" as const } : { fontFamily: fam.bold, fontWeight: 700 as const };

  const accent = cfg.primary_color;
  const dark = cfg.secondary_color;
  const midDark = "#374151";
  const border = "#e5e7eb";
  const muted = cfg.muted_color;
  const white = "#ffffff";
  const lightBg = cfg.table_header_bg;
  const isClassic = cfg.base === "classic";

  const siteAddress = [customer?.address, customer?.city, customer?.postcode, customer?.country].filter(Boolean).join(", ");
  const firstItemName = lineItems[0]?.name ?? "";
  const subtitle = firstItemName && siteAddress ? `${firstItemName} — ${siteAddress}` : siteAddress || firstItemName || quote.number;

  const noteLines = (quote.notes ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  const termLines = (quote.terms ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  const allNotes = [
    ...(cfg.show_notes ? noteLines : []),
    ...(cfg.show_terms ? termLines : []),
  ];

  const vars: Record<string, string> = {
    customer_name: customer?.name ?? "",
    customer_company: customer?.company ?? "",
    customer_email: customer?.email ?? "",
    quote_number: quote.number,
    document_number: quote.number,
    issue_date: fmtDate(quote.issue_date),
    expiry_date: fmtDate(quote.expiry_date),
    total: fmt(quote.total),
    business_name: business.name,
    property_address: quote.property_address ?? "",
  };
  const fieldsAt = (p: "header" | "meta" | "footer") => cfg.custom_fields.filter((f) => f.placement === p && (f.label || f.value));

  // Columns: the scope table always leads with a # column; the rest come from
  // the configured, visible columns (description always shown).
  const visibleCols = cfg.columns.filter((c) => c.visible && c.key !== "description");
  const colWidth = (key: TemplateColumn["key"]) =>
    key === "quantity" ? 46 : key === "tax" ? 46 : 82;
  const colValue = (item: LineItem, key: TemplateColumn["key"]) => {
    switch (key) {
      case "quantity": return String(item.quantity);
      case "unit_price": return fmt(item.unit_price);
      case "tax": return `${item.tax_rate}%`;
      case "total": return item.total === 0 ? "Included" : fmt(item.total);
      default: return "";
    }
  };

  const styles = StyleSheet.create({
    page: { fontFamily: fam.regular, fontSize: fs(9), color: cfg.text_color, backgroundColor: cfg.background_color, paddingBottom: 56 },
    bgLayer: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
    bgImage: { width: "100%", height: "100%", objectFit: "cover", opacity: cfg.background_image_opacity },
    watermark: { position: "absolute", top: "42%", left: 0, right: 0, textAlign: "center", fontSize: 90, color: muted, opacity: cfg.watermark_opacity, transform: "rotate(-24deg)", ...bold },

    footer: { position: "absolute", bottom: 0, left: 0, right: 0, borderTopWidth: 1, borderTopColor: border, paddingVertical: 9, paddingHorizontal: 40, backgroundColor: cfg.background_color },
    footerText: { fontSize: fs(7.5), color: muted, textAlign: "center", lineHeight: 1.5 },

    headerWrap: { paddingHorizontal: 40, paddingTop: 32, paddingBottom: 16 },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
    logo: { width: cfg.logo_size, height: cfg.logo_size * 0.7, objectFit: "contain" },
    headerRight: { textAlign: "right" },
    headerContact: { fontSize: fs(8), color: muted, lineHeight: 1.7, textAlign: "right" },
    headerLink: { fontSize: fs(8), color: accent, textAlign: "right", lineHeight: 1.7 },

    titleBand: { backgroundColor: dark, paddingVertical: 16, paddingHorizontal: 40 },
    titleText: { fontSize: fs(26), ...bold, color: accent, textAlign: "center", letterSpacing: 4 },

    subtitleRow: { paddingHorizontal: 40, paddingTop: 14, paddingBottom: 4 },
    subtitleText: { textAlign: "center", fontSize: fs(10), color: midDark },

    body: { paddingHorizontal: 40, paddingTop: 18 },

    infoSection: { flexDirection: "row", justifyContent: "space-between", marginBottom: 18 },
    quoteToBox: { backgroundColor: lightBg, padding: 14, width: "47%" },
    quoteToLabel: { fontSize: fs(7.5), ...bold, color: accent, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 },
    quoteToName: { ...bold, fontSize: fs(11), marginBottom: 2 },
    quoteToDetail: { fontSize: fs(9), color: midDark, lineHeight: 1.6 },
    infoRight: { width: "47%", paddingTop: 2 },
    infoRow: { flexDirection: "row", justifyContent: "flex-end", marginBottom: 5, alignItems: "flex-start" },
    infoLabel: { color: muted, fontSize: fs(9), marginRight: 6 },
    infoValue: { ...bold, fontSize: fs(9), textAlign: "right" },
    infoValueLg: { ...bold, fontSize: fs(11), textAlign: "right" },

    siteBar: { backgroundColor: midDark, paddingVertical: 8, paddingHorizontal: 12, marginBottom: 16, flexDirection: "row", alignItems: "center" },
    siteLabel: { fontSize: fs(8.5), ...bold, color: accent, marginRight: 8 },
    siteAddressText: { fontSize: fs(9), color: white },

    tableWrap: { marginBottom: 14 },
    tableTitle: { backgroundColor: dark, paddingVertical: 9, paddingHorizontal: 10 },
    tableTitleText: { fontSize: fs(11), ...bold, color: accent, textAlign: "center" },
    colHeaders: { flexDirection: "row", backgroundColor: lightBg, paddingVertical: 6, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: border },
    colHeader: { fontSize: fs(8), ...bold, color: cfg.heading_color },
    tableRow: { flexDirection: "row", paddingVertical: 7, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: border },
    tableRowAlt: { backgroundColor: "#fafafa" },
    colNum: { width: 20, fontSize: fs(9) },
    colDesc: { flex: 1, paddingRight: 8 },
    colDescName: { fontSize: fs(9), ...bold },
    colDescDetail: { fontSize: fs(8), color: muted, marginTop: 1 },

    totalsWrap: { flexDirection: "row", justifyContent: "flex-end", marginBottom: 18 },
    totalsBox: { width: 240 },
    totalsBorder: { borderTopWidth: 1, borderTopColor: border },
    totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5, paddingHorizontal: 10 },
    totalLabel: { fontSize: fs(9), color: muted },
    totalValue: { fontSize: fs(9) },
    grandTotalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 7, paddingHorizontal: 10, backgroundColor: dark },
    grandTotalLabel: { fontSize: fs(10), ...bold, color: accent },
    grandTotalValue: { fontSize: fs(10), ...bold, color: accent },

    notesBox: { borderWidth: 1, borderColor: border, padding: 14, marginBottom: 16 },
    notesTitle: { fontSize: fs(9), ...bold, marginBottom: 8, color: cfg.heading_color },
    notesItem: { fontSize: fs(8.5), color: midDark, lineHeight: 1.7, marginBottom: 2 },

    fieldRow: { flexDirection: "row", marginBottom: 2 },
    fieldLabel: { color: muted, marginRight: 4, ...bold },

    acceptBox: { borderWidth: 1, borderColor: border, padding: 18, marginTop: 4 },
    acceptTitle: { fontSize: fs(10), ...bold, marginBottom: 10, color: cfg.heading_color },
    acceptText: { fontSize: fs(9), color: midDark, lineHeight: 1.7, marginBottom: 16 },
    acceptRow: { flexDirection: "row", alignItems: "flex-end", marginBottom: 18 },
    acceptLabel: { fontSize: fs(9), marginRight: 8, minWidth: 72 },
    acceptUnderline: { flex: 1, borderBottomWidth: 1, borderBottomColor: dark, height: 18 },
    acceptDateLabel: { fontSize: fs(9), marginLeft: 20, marginRight: 8, minWidth: 32 },
    acceptDateLine: { width: 100, borderBottomWidth: 1, borderBottomColor: dark, height: 18 },
    acceptSigRow: { flexDirection: "row", alignItems: "flex-end", marginBottom: 18 },
    acceptSigLine: { width: 200, borderBottomWidth: 1, borderBottomColor: dark, height: 18 },
    acceptContact: { fontSize: fs(9), color: midDark, lineHeight: 1.7 },
  });

  const footerStr = [business.name, business.phone ? `Ph: ${business.phone}` : null, business.email, business.website].filter(Boolean).join(" | ");
  const footerLine2 = cfg.footer_text || (business.tax_number ? `ABN: ${business.tax_number}` : null);

  const Background = () => (
    <>
      {cfg.background_image_url && <View style={styles.bgLayer} fixed><Image src={cfg.background_image_url} style={styles.bgImage} /></View>}
      {cfg.watermark_text && <Text style={styles.watermark} fixed>{cfg.watermark_text}</Text>}
    </>
  );

  const CustomFields = ({ where }: { where: "header" | "meta" | "footer" }) => {
    const list = fieldsAt(where);
    if (!list.length) return null;
    return (
      <View style={{ marginTop: 6 }}>
        {list.map((f) => (
          <View key={f.id} style={styles.fieldRow}>
            {f.label ? <Text style={styles.fieldLabel}>{f.label}:</Text> : null}
            <Text style={{ fontSize: fs(9), color: midDark }}>{resolvePlaceholders(f.value, vars)}</Text>
          </View>
        ))}
      </View>
    );
  };

  const Header = () => (
    <View style={styles.headerWrap}>
      <View style={styles.header}>
        <View>{cfg.show_logo && business.logo_url && <Image src={business.logo_url} style={styles.logo} />}</View>
        <View style={styles.headerRight}>
          {(business.phone || business.email) && (
            <Text style={styles.headerContact}>{[business.phone ? `Ph: ${business.phone}` : null, business.email].filter(Boolean).join(" | ")}</Text>
          )}
          {business.website && <Text style={styles.headerLink}>{business.website}</Text>}
          {business.tax_number && <Text style={styles.headerContact}>ABN: {business.tax_number}</Text>}
          <CustomFields where="header" />
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
      <Page size="A4" style={styles.page}>
        <Background />
        <Header />

        {!isClassic ? (
          <View style={styles.titleBand}><Text style={styles.titleText}>{cfg.document_title}</Text></View>
        ) : (
          <View style={{ paddingHorizontal: 40, paddingTop: 8, paddingBottom: 4 }}>
            <Text style={{ fontSize: fs(22), ...bold, color: accent }}>{cfg.document_title}</Text>
          </View>
        )}

        <View style={styles.subtitleRow}><Text style={styles.subtitleText}>{subtitle}</Text></View>

        <View style={styles.body}>
          <View style={styles.infoSection}>
            <View style={styles.quoteToBox}>
              <Text style={styles.quoteToLabel}>{cfg.section_title_billto.toUpperCase()}:</Text>
              {customer ? (
                <>
                  <Text style={styles.quoteToName}>{customer.name}</Text>
                  {customer.company && <Text style={styles.quoteToDetail}>{customer.company}</Text>}
                  {customer.address && <Text style={styles.quoteToDetail}>{customer.address}</Text>}
                  {customer.city && <Text style={styles.quoteToDetail}>{customer.city}{customer.postcode ? ` ${customer.postcode}` : ""}</Text>}
                </>
              ) : <Text style={styles.quoteToDetail}>—</Text>}
              {quote.property_address && (
                <>
                  <Text style={[styles.quoteToLabel, { marginTop: 8 }]}>SERVICE ADDRESS:</Text>
                  <Text style={styles.quoteToDetail}>{quote.property_address}</Text>
                </>
              )}
            </View>

            <View style={styles.infoRight}>
              <View style={styles.infoRow}><Text style={styles.infoLabel}>Quote Number:</Text><Text style={styles.infoValueLg}>{quote.number}</Text></View>
              <View style={styles.infoRow}><Text style={styles.infoLabel}>Quote Date:</Text><Text style={styles.infoValue}>{fmtDate(quote.issue_date)}</Text></View>
              <View style={styles.infoRow}><Text style={styles.infoLabel}>Valid Until:</Text><Text style={styles.infoValue}>{fmtDate(quote.expiry_date)}</Text></View>
              {business.tax_number && <View style={styles.infoRow}><Text style={styles.infoLabel}>ABN:</Text><Text style={styles.infoValue}>{business.tax_number}</Text></View>}
              <View style={{ alignItems: "flex-end" }}><CustomFields where="meta" /></View>
            </View>
          </View>

          {siteAddress && (
            <View style={styles.siteBar}>
              <Text style={styles.siteLabel}>SITE ADDRESS:</Text>
              <Text style={styles.siteAddressText}>{siteAddress}</Text>
            </View>
          )}

          <View style={styles.tableWrap}>
            <View style={styles.tableTitle}><Text style={styles.tableTitleText}>{cfg.section_title_items.toUpperCase()}</Text></View>
            <View style={styles.colHeaders}>
              <Text style={[styles.colHeader, styles.colNum]}>#</Text>
              <Text style={[styles.colHeader, styles.colDesc]}>Description of Works</Text>
              {visibleCols.map((c) => (
                <Text key={c.key} style={[styles.colHeader, { width: colWidth(c.key), textAlign: c.key === "quantity" ? "center" : "right" }]}>
                  {c.key === "tax" ? cfg.label_tax : c.key === "total" ? `Amount (${currency})` : c.label}
                </Text>
              ))}
            </View>
            {lineItems.map((item, i) => (
              <View key={item.id} style={[styles.tableRow, i % 2 === 1 ? styles.tableRowAlt : {}]} wrap={false}>
                <Text style={styles.colNum}>{i + 1}</Text>
                <View style={styles.colDesc}>
                  <Text style={styles.colDescName}>{item.name}</Text>
                  {item.description && <Text style={styles.colDescDetail}>{item.description}</Text>}
                </View>
                {visibleCols.map((c) => (
                  <Text key={c.key} style={{ width: colWidth(c.key), fontSize: fs(9), textAlign: c.key === "quantity" ? "center" : "right" }}>
                    {colValue(item, c.key)}
                  </Text>
                ))}
              </View>
            ))}
          </View>

          <View style={styles.totalsWrap}>
            <View style={styles.totalsBox}>
              <View style={styles.totalsBorder} />
              <View style={styles.totalRow}><Text style={styles.totalLabel}>Subtotal (excl. {cfg.label_tax})</Text><Text style={styles.totalValue}>{fmt(quote.subtotal)}</Text></View>
              {quote.discount_amount > 0 && <View style={styles.totalRow}><Text style={styles.totalLabel}>Discount</Text><Text style={styles.totalValue}>- {fmt(quote.discount_amount)}</Text></View>}
              <View style={styles.totalRow}><Text style={styles.totalLabel}>{cfg.label_tax}</Text><Text style={styles.totalValue}>{fmt(quote.tax_total)}</Text></View>
              <View style={styles.grandTotalRow}><Text style={styles.grandTotalLabel}>TOTAL (incl. {cfg.label_tax})</Text><Text style={styles.grandTotalValue}>{fmt(quote.total)} {currency}</Text></View>
            </View>
          </View>

          {allNotes.length > 0 && (
            <View style={styles.notesBox}>
              <Text style={styles.notesTitle}>{cfg.section_title_notes.toUpperCase()} &amp; CONDITIONS</Text>
              {allNotes.map((line, i) => <Text key={i} style={styles.notesItem}>• {line}</Text>)}
              <CustomFields where="footer" />
            </View>
          )}
        </View>

        <Footer />
      </Page>

      {cfg.show_signature && (
        <Page size="A4" style={styles.page}>
          <Background />
          <Header />
          <View style={styles.body}>
            <View style={styles.acceptBox}>
              <Text style={styles.acceptTitle}>ACCEPTANCE OF QUOTE</Text>
              <Text style={styles.acceptText}>I/We accept the above quote and authorise {business.name} to proceed with the works described.</Text>
              <View style={styles.acceptRow}>
                <Text style={styles.acceptLabel}>Client Name:</Text><View style={styles.acceptUnderline} />
                <Text style={styles.acceptDateLabel}>Date:</Text><View style={styles.acceptDateLine} />
              </View>
              <View style={styles.acceptSigRow}><Text style={styles.acceptLabel}>Signature:</Text><View style={styles.acceptSigLine} /></View>
              {(business.email || business.phone) && (
                <View>
                  {business.email && <Text style={styles.acceptContact}>To accept, please sign and return this document to: {business.email}</Text>}
                  {business.phone && <Text style={styles.acceptContact}>or call {business.phone} to confirm.</Text>}
                </View>
              )}
            </View>
          </View>
          <Footer />
        </Page>
      )}
    </Document>
  );
}
