import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import type { Business, Customer, Invoice, LineItem, PdfSettings } from "@/types/database";
import type { TemplateConfig, TemplateColumn } from "@/lib/documents/template-config";
import { resolveTemplateConfig, fontFamilyFor, resolvePlaceholders } from "@/lib/documents/template-config";
import { RichPdfText } from "@/components/documents/rich-pdf-text";

function fmtCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(amount);
}
function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });
}

interface Props {
  invoice: Invoice;
  customer: Customer | null;
  business: Business;
  lineItems: LineItem[];
  /** Preferred: a fully-resolved template config. */
  config?: TemplateConfig | null;
  /** Back-compat: legacy per-business settings (used when `config` is absent). */
  pdfSettings?: PdfSettings | null;
}

export function InvoicePDFDocument({ invoice, customer, business, lineItems, config, pdfSettings }: Props) {
  const cfg: TemplateConfig = config ?? resolveTemplateConfig({
    pdfSettings: pdfSettings ?? business.pdf_settings ?? null,
    docType: "invoice",
  });

  const currency = business.currency ?? "AUD";
  const fmt = (amount: number) => fmtCurrency(amount, currency);
  const scale = cfg.font_scale || 1;
  const fs = (n: number) => Math.round(n * scale * 10) / 10;

  const fam = fontFamilyFor(cfg.font_family);
  const isHelv = cfg.font_family === "helvetica";
  const bold = isHelv ? { fontFamily: "Helvetica-Bold" as const } : { fontFamily: fam.bold, fontWeight: 700 as const };

  const primary = cfg.primary_color;
  const text = cfg.text_color;
  const muted = cfg.muted_color;
  const heading = cfg.heading_color;
  const border = "#e2e8f0";
  const white = "#ffffff";
  const isMinimal = cfg.base === "minimal";
  const isModern = cfg.base === "modern";

  // Placeholders available to custom fields.
  const vars: Record<string, string> = {
    customer_name: customer?.name ?? "",
    customer_company: customer?.company ?? "",
    customer_email: customer?.email ?? "",
    invoice_number: invoice.number,
    document_number: invoice.number,
    issue_date: fmtDate(invoice.issue_date),
    due_date: fmtDate(invoice.due_date),
    total: fmt(invoice.total),
    balance: fmt(invoice.total - invoice.amount_paid),
    business_name: business.name,
    property_address: invoice.property_address ?? "",
  };
  const fieldsAt = (p: "header" | "meta" | "footer") =>
    cfg.custom_fields.filter((f) => f.placement === p && (f.label || f.value));

  const styles = StyleSheet.create({
    page: { fontFamily: fam.regular, fontSize: fs(9), color: text, padding: 40, backgroundColor: cfg.background_color },
    bgLayer: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
    bgImage: { width: "100%", height: "100%", objectFit: "cover", opacity: cfg.background_image_opacity },
    watermark: { position: "absolute", top: "42%", left: 0, right: 0, textAlign: "center", fontSize: 90, color: muted, opacity: cfg.watermark_opacity, transform: "rotate(-24deg)", ...bold },

    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: isModern ? 0 : 32 },
    headerModernWrap: { marginBottom: 28 },
    modernTopBar: { backgroundColor: cfg.secondary_color, flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 40, paddingVertical: 14, marginHorizontal: -40, marginTop: -40, marginBottom: 24 },
    logo: { width: cfg.logo_size, height: cfg.logo_size, objectFit: "contain", marginBottom: 8 },
    bizBlock: { alignItems: cfg.logo_position === "center" ? "center" : cfg.logo_position === "right" ? "flex-end" : "flex-start" },
    businessName: { fontSize: fs(13), ...bold, marginBottom: 3, color: heading },
    businessDetail: { color: muted, fontSize: fs(8), lineHeight: 1.5 },

    docLabel: { fontSize: fs(22), ...bold, color: isModern ? white : (isMinimal ? heading : primary), textAlign: "right" },
    docNumber: { fontSize: fs(16), ...bold, textAlign: "right", marginTop: 2, color: isModern ? white : text },
    minimalRule: { borderBottomWidth: 2, borderBottomColor: heading, marginBottom: 24 },

    section: { flexDirection: "row", justifyContent: "space-between", marginBottom: 24 },
    smallLabel: { fontSize: fs(7), ...bold, color: muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 },
    billToName: { ...bold, fontSize: fs(10), marginBottom: 3, color: heading },
    billToDetail: { color: muted, lineHeight: 1.5 },
    dateRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
    dateLabel: { color: muted, fontSize: fs(8) },
    dateValue: { ...bold, textAlign: "right" },

    tableHeader: { flexDirection: "row", backgroundColor: isMinimal ? white : cfg.table_header_bg, padding: "8 10", borderRadius: isMinimal ? 0 : 4, borderBottomWidth: isMinimal ? 1 : 0, borderBottomColor: heading, marginBottom: 2 },
    tableRow: { flexDirection: "row", padding: "8 10", borderBottomWidth: 1, borderBottomColor: border, borderStyle: "dashed" },
    colHeader: { fontSize: fs(7), ...bold, color: isMinimal ? heading : cfg.table_header_text, textTransform: "uppercase", letterSpacing: 0.5 },
    cellName: { ...bold, marginBottom: 2 },
    cellDesc: { color: muted, fontSize: fs(8) },

    totalsSection: { flexDirection: "row", justifyContent: "flex-end", marginTop: 16 },
    totalsBox: { width: 200 },
    totalRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
    totalLabel: { color: muted },
    grandTotalRow: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1.5, borderTopColor: heading, paddingTop: 8, marginTop: 4 },
    grandTotalLabel: { ...bold, fontSize: fs(11) },
    grandTotalValue: { ...bold, fontSize: fs(11), color: isMinimal ? heading : primary },

    footer: { marginTop: 32, paddingTop: 16, borderTopWidth: 1, borderTopColor: border, flexDirection: "row", justifyContent: "space-between" },
    footerSection: { flex: 1, marginRight: 20 },
    footerTitle: { fontSize: fs(7), ...bold, color: muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 },
    footerText: { color: muted, lineHeight: 1.6, fontSize: fs(8) },
    bankRow: { flexDirection: "row", marginBottom: 3 },
    bankLabel: { color: muted, width: 70 },
    bankValue: { flex: 1 },
    badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, alignSelf: "flex-start" },
    paidBadge: { backgroundColor: "#dcfce7" },
    paidText: { color: "#16a34a", ...bold, fontSize: fs(8) },
    fieldRow: { flexDirection: "row", marginBottom: 2 },
    fieldLabel: { color: muted, marginRight: 4 },
  });

  // Column geometry: fixed widths for the numeric columns, description flexes.
  const colStyle = (key: TemplateColumn["key"]) => {
    switch (key) {
      case "description": return { flex: 1 };
      case "quantity": return { width: 40, textAlign: "center" as const };
      case "unit_price": return { width: 60, textAlign: "right" as const };
      case "tax": return { width: 40, textAlign: "center" as const };
      case "total": return { width: 70, textAlign: "right" as const };
    }
  };
  const visibleCols = cfg.columns.filter((c) => c.visible);
  const cellValue = (item: LineItem, key: TemplateColumn["key"]) => {
    switch (key) {
      case "quantity": return String(item.quantity);
      case "unit_price": return fmt(item.unit_price);
      case "tax": return `${item.tax_rate}%`;
      case "total": return fmt(item.total);
      default: return null;
    }
  };

  const CustomFields = ({ where }: { where: "header" | "meta" | "footer" }) => {
    const list = fieldsAt(where);
    if (!list.length) return null;
    const inFooter = where === "footer";
    return (
      <View style={inFooter ? styles.footerSection : { marginTop: where === "meta" ? 8 : 6 }}>
        {list.map((f) => (
          <View key={f.id} style={{ marginBottom: 5 }}>
            {f.label ? <Text style={inFooter ? styles.footerTitle : [styles.fieldLabel, bold]}>{f.label}</Text> : null}
            <RichPdfText
              text={resolvePlaceholders(f.value, vars)}
              style={inFooter ? styles.footerText : { fontSize: fs(8.5), color: muted }}
              boldStyle={bold}
              bulletColor={primary}
            />
          </View>
        ))}
      </View>
    );
  };

  const BizDetails = () => (
    <>
      {business.address && <Text style={styles.businessDetail}>{business.address}</Text>}
      {business.city && <Text style={styles.businessDetail}>{business.city}{business.postcode ? `, ${business.postcode}` : ""}</Text>}
      {business.email && <Text style={styles.businessDetail}>{business.email}</Text>}
      {business.phone && <Text style={styles.businessDetail}>{business.phone}</Text>}
      {business.tax_number && <Text style={styles.businessDetail}>ABN: {business.tax_number}</Text>}
    </>
  );

  const PaidBadge = ({ mt = 0 }: { mt?: number }) => invoice.status === "paid" ? (
    <View style={[styles.badge, styles.paidBadge, mt ? { marginTop: mt } : {}]}><Text style={styles.paidText}>PAID</Text></View>
  ) : null;

  const ClassicHeader = () => (
    <View style={styles.header}>
      <View style={styles.bizBlock}>
        {cfg.show_logo && business.logo_url && <Image src={business.logo_url} style={styles.logo} />}
        <Text style={styles.businessName}>{business.name}</Text>
        <BizDetails />
        <CustomFields where="header" />
      </View>
      <View>
        <Text style={styles.docLabel}>{cfg.document_title}</Text>
        <Text style={styles.docNumber}>{invoice.number}</Text>
        <PaidBadge />
      </View>
    </View>
  );

  const ModernHeader = () => (
    <View style={styles.headerModernWrap}>
      <View style={styles.modernTopBar}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          {cfg.show_logo && business.logo_url && <Image src={business.logo_url} style={[styles.logo, { marginBottom: 0 }]} />}
          <View>
            <Text style={{ ...bold, fontSize: fs(13), color: white }}>{business.name}</Text>
            {business.email && <Text style={{ fontSize: fs(8), color: "#cbd5e1" }}>{business.email}</Text>}
          </View>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={styles.docLabel}>{cfg.document_title}</Text>
          <Text style={styles.docNumber}>{invoice.number}</Text>
          <PaidBadge mt={3} />
        </View>
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <View><BizDetails /><CustomFields where="header" /></View>
      </View>
    </View>
  );

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {cfg.background_image_url && (
          <View style={styles.bgLayer} fixed><Image src={cfg.background_image_url} style={styles.bgImage} /></View>
        )}
        {cfg.watermark_text && <Text style={styles.watermark} fixed>{cfg.watermark_text}</Text>}
        {cfg.header_text && <Text style={{ fontSize: fs(8), color: muted, marginBottom: 8 }}>{cfg.header_text}</Text>}

        {isModern ? <ModernHeader /> : <ClassicHeader />}
        {isMinimal && <View style={styles.minimalRule} />}

        <View style={styles.section}>
          <View style={{ flex: 1, marginRight: 20 }}>
            <Text style={styles.smallLabel}>{cfg.section_title_billto}</Text>
            {customer ? (
              <>
                <Text style={styles.billToName}>{customer.name}</Text>
                {customer.company && <Text style={styles.billToDetail}>{customer.company}</Text>}
                {customer.email && <Text style={styles.billToDetail}>{customer.email}</Text>}
                {customer.address && <Text style={styles.billToDetail}>{customer.address}</Text>}
                {customer.city && <Text style={styles.billToDetail}>{customer.city}{customer.postcode ? `, ${customer.postcode}` : ""}</Text>}
                {customer.tax_number && <Text style={styles.billToDetail}>ABN: {customer.tax_number}</Text>}
              </>
            ) : <Text style={styles.billToDetail}>—</Text>}
            {invoice.property_address && (
              <>
                <Text style={[styles.smallLabel, { marginTop: 10 }]}>Service Address</Text>
                <Text style={styles.billToDetail}>{invoice.property_address}</Text>
              </>
            )}
          </View>
          <View style={{ width: 150 }}>
            <View style={styles.dateRow}><Text style={styles.dateLabel}>Issue date</Text><Text style={styles.dateValue}>{fmtDate(invoice.issue_date)}</Text></View>
            <View style={styles.dateRow}><Text style={styles.dateLabel}>Due date</Text><Text style={styles.dateValue}>{fmtDate(invoice.due_date)}</Text></View>
            <CustomFields where="meta" />
          </View>
        </View>

        {/* Line items — columns driven by config */}
        <View style={styles.tableHeader}>
          {visibleCols.map((c) => (
            <Text key={c.key} style={[colStyle(c.key), styles.colHeader]}>{c.key === "tax" ? cfg.label_tax : c.label}</Text>
          ))}
        </View>
        {lineItems.map((item) => (
          <View key={item.id} style={styles.tableRow}>
            {visibleCols.map((c) => c.key === "description" ? (
              <View key={c.key} style={colStyle(c.key)}>
                <Text style={styles.cellName}>{item.name}</Text>
                {item.description && <Text style={styles.cellDesc}>{item.description}</Text>}
              </View>
            ) : (
              <Text key={c.key} style={[colStyle(c.key), c.key === "total" ? bold : {}]}>{cellValue(item, c.key)}</Text>
            ))}
          </View>
        ))}

        {/* Totals */}
        <View style={styles.totalsSection}>
          <View style={styles.totalsBox}>
            <View style={styles.totalRow}><Text style={styles.totalLabel}>Subtotal</Text><Text>{fmt(invoice.subtotal)}</Text></View>
            {invoice.discount_amount > 0 && <View style={styles.totalRow}><Text style={styles.totalLabel}>Discount</Text><Text>- {fmt(invoice.discount_amount)}</Text></View>}
            <View style={styles.totalRow}><Text style={styles.totalLabel}>{cfg.label_tax}</Text><Text>{fmt(invoice.tax_total)}</Text></View>
            <View style={styles.grandTotalRow}><Text style={styles.grandTotalLabel}>Total</Text><Text style={styles.grandTotalValue}>{fmt(invoice.total)}</Text></View>
            {invoice.amount_paid > 0 && (
              <>
                <View style={[styles.totalRow, { marginTop: 8 }]}><Text style={{ color: "#16a34a" }}>Paid</Text><Text style={{ color: "#16a34a" }}>{fmt(invoice.amount_paid)}</Text></View>
                <View style={styles.totalRow}><Text style={styles.totalLabel}>Balance due</Text><Text style={bold}>{fmt(invoice.total - invoice.amount_paid)}</Text></View>
              </>
            )}
          </View>
        </View>

        {/* Footer */}
        {cfg.show_footer && (invoice.notes || invoice.terms || business.bank_account_name || cfg.footer_text || fieldsAt("footer").length > 0) && (
          <View style={styles.footer}>
            {cfg.show_notes && invoice.notes && (
              <View style={styles.footerSection}><Text style={styles.footerTitle}>{cfg.section_title_notes}</Text><Text style={styles.footerText}>{invoice.notes}</Text></View>
            )}
            {cfg.show_terms && invoice.terms && (
              <View style={styles.footerSection}><Text style={styles.footerTitle}>{cfg.section_title_terms}</Text><Text style={styles.footerText}>{invoice.terms}</Text></View>
            )}
            {cfg.show_payment_details && business.bank_account_name && (
              <View style={styles.footerSection}>
                <Text style={styles.footerTitle}>{cfg.section_title_payment}</Text>
                {business.bank_name && <View style={styles.bankRow}><Text style={styles.bankLabel}>{cfg.label_bank}</Text><Text style={styles.bankValue}>{business.bank_name}</Text></View>}
                <View style={styles.bankRow}><Text style={styles.bankLabel}>{cfg.label_account_name}</Text><Text style={styles.bankValue}>{business.bank_account_name}</Text></View>
                {business.bank_account_number && <View style={styles.bankRow}><Text style={styles.bankLabel}>{cfg.label_account_number}</Text><Text style={styles.bankValue}>{business.bank_account_number}</Text></View>}
                {business.bank_sort_code && <View style={styles.bankRow}><Text style={styles.bankLabel}>{cfg.label_bsb}</Text><Text style={styles.bankValue}>{business.bank_sort_code}</Text></View>}
              </View>
            )}
            <CustomFields where="footer" />
          </View>
        )}
        {cfg.show_footer && cfg.footer_text && (
          <Text style={{ fontSize: fs(7.5), color: muted, textAlign: "center", marginTop: 12 }} fixed>{cfg.footer_text}</Text>
        )}
      </Page>
    </Document>
  );
}
