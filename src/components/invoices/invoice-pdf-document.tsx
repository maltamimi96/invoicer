import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import type { Business, Customer, Invoice, LineItem, PdfSettings } from "@/types/database";
import { DEFAULT_PDF_SETTINGS } from "@/types/database";

function fmtCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
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
  pdfSettings?: PdfSettings | null;
}

export function InvoicePDFDocument({ invoice, customer, business, lineItems, pdfSettings }: Props) {
  const settings: PdfSettings = { ...DEFAULT_PDF_SETTINGS, ...(pdfSettings ?? business.pdf_settings ?? {}) };
  const currency = business.currency ?? "AUD";
  const fmt = (amount: number) => fmtCurrency(amount, currency);
  const primary = settings.primary_color;
  const logoSize = settings.logo_size;
  const template = settings.invoice_template;

  const isMinimal = template === "minimal";
  const isModern = template === "modern";

  const muted = "#64748b";
  const border = "#e2e8f0";
  const text = "#0f172a";
  const white = "#ffffff";
  const bg = isMinimal ? white : "#f8fafc";

  const styles = StyleSheet.create({
    page: { fontFamily: "Helvetica", fontSize: 9, color: text, padding: 40, backgroundColor: white },

    // ── Header ──
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: isModern ? 0 : 32 },
    headerModernWrap: { marginBottom: 28 },
    modernTopBar: { backgroundColor: "#111827", flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 40, paddingVertical: 14, marginHorizontal: -40, marginTop: -40, marginBottom: 24 },
    logo: { width: logoSize, height: logoSize, objectFit: "contain" },
    businessName: { fontSize: 13, fontFamily: "Helvetica-Bold", marginBottom: 3 },
    businessDetail: { color: muted, fontSize: 8, lineHeight: 1.5 },

    invoiceLabelClassic: { fontSize: 22, fontFamily: "Helvetica-Bold", color: primary, textAlign: "right" },
    invoiceLabelMinimal: { fontSize: 22, fontFamily: "Helvetica-Bold", color: text, textAlign: "right" },
    invoiceLabelModern: { fontSize: 22, fontFamily: "Helvetica-Bold", color: white, textAlign: "right" },
    invoiceNumber: { fontSize: 16, fontFamily: "Helvetica-Bold", textAlign: "right", marginTop: 2 },
    invoiceNumberModern: { fontSize: 16, fontFamily: "Helvetica-Bold", color: white, textAlign: "right", marginTop: 2 },
    minimalRule: { borderBottomWidth: 2, borderBottomColor: text, marginBottom: 24 },

    // ── Section ──
    section: { flexDirection: "row", justifyContent: "space-between", marginBottom: 24 },
    billToLabel: { fontSize: 7, fontFamily: "Helvetica-Bold", color: muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 },
    billToName: { fontFamily: "Helvetica-Bold", fontSize: 10, marginBottom: 3 },
    billToDetail: { color: muted, lineHeight: 1.5 },
    dateRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
    dateLabel: { color: muted, fontSize: 8, width: 60 },
    dateValue: { fontFamily: "Helvetica-Bold", textAlign: "right" },

    // ── Table ──
    tableHeader: {
      flexDirection: "row",
      backgroundColor: isMinimal ? white : bg,
      padding: "8 10",
      borderRadius: isMinimal ? 0 : 4,
      borderBottomWidth: isMinimal ? 1 : 0,
      borderBottomColor: text,
      marginBottom: 2,
    },
    tableRow: { flexDirection: "row", padding: "8 10", borderBottomWidth: 1, borderBottomColor: border, borderStyle: "dashed" },
    tableItem: { flex: 1 },
    tableItemName: { fontFamily: "Helvetica-Bold", marginBottom: 2 },
    tableItemDesc: { color: muted, fontSize: 8 },
    tableQty: { width: 40, textAlign: "center" },
    tablePrice: { width: 60, textAlign: "right" },
    tableTax: { width: 40, textAlign: "center" },
    tableTotal: { width: 70, textAlign: "right", fontFamily: "Helvetica-Bold" },
    colHeader: { fontSize: 7, fontFamily: "Helvetica-Bold", color: isMinimal ? text : muted, textTransform: "uppercase", letterSpacing: 0.5 },

    // ── Totals ──
    totalsSection: { flexDirection: "row", justifyContent: "flex-end", marginTop: 16 },
    totalsBox: { width: 200 },
    totalRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
    totalLabel: { color: muted },
    grandTotalRow: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1.5, borderTopColor: text, paddingTop: 8, marginTop: 4 },
    grandTotalLabel: { fontFamily: "Helvetica-Bold", fontSize: 11 },
    grandTotalValue: { fontFamily: "Helvetica-Bold", fontSize: 11, color: isMinimal ? text : primary },

    // ── Footer ──
    footer: { marginTop: 32, paddingTop: 16, borderTopWidth: 1, borderTopColor: border, flexDirection: "row", justifyContent: "space-between" },
    footerSection: { flex: 1, marginRight: 20 },
    footerTitle: { fontSize: 7, fontFamily: "Helvetica-Bold", color: muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 },
    footerText: { color: muted, lineHeight: 1.6, fontSize: 8 },
    bankRow: { flexDirection: "row", marginBottom: 3 },
    bankLabel: { color: muted, width: 70 },
    bankValue: { flex: 1 },
    badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, alignSelf: "flex-start" },
    paidBadge: { backgroundColor: "#dcfce7" },
    paidText: { color: "#16a34a", fontFamily: "Helvetica-Bold", fontSize: 8 },
  });

  const invoiceTitle = settings.invoice_title;

  // Classic / Minimal header
  const ClassicHeader = () => (
    <View style={styles.header}>
      <View>
        {business.logo_url && <Image src={business.logo_url} style={styles.logo} />}
        <Text style={styles.businessName}>{business.name}</Text>
        {business.address && <Text style={styles.businessDetail}>{business.address}</Text>}
        {business.city && <Text style={styles.businessDetail}>{business.city}{business.postcode ? `, ${business.postcode}` : ""}</Text>}
        {business.email && <Text style={styles.businessDetail}>{business.email}</Text>}
        {business.phone && <Text style={styles.businessDetail}>{business.phone}</Text>}
        {business.tax_number && <Text style={styles.businessDetail}>ABN: {business.tax_number}</Text>}
      </View>
      <View>
        <Text style={isMinimal ? styles.invoiceLabelMinimal : styles.invoiceLabelClassic}>{invoiceTitle}</Text>
        <Text style={styles.invoiceNumber}>{invoice.number}</Text>
        {invoice.status === "paid" && (
          <View style={[styles.badge, styles.paidBadge]}>
            <Text style={styles.paidText}>PAID</Text>
          </View>
        )}
      </View>
    </View>
  );

  // Modern header (dark top bar)
  const ModernHeader = () => (
    <View style={styles.headerModernWrap}>
      <View style={styles.modernTopBar}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          {business.logo_url && <Image src={business.logo_url} style={[styles.logo, { marginBottom: 0 }]} />}
          <View>
            <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 13, color: white }}>{business.name}</Text>
            {business.email && <Text style={{ fontSize: 8, color: "#9ca3af" }}>{business.email}</Text>}
          </View>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={styles.invoiceLabelModern}>{invoiceTitle}</Text>
          <Text style={styles.invoiceNumberModern}>{invoice.number}</Text>
          {invoice.status === "paid" && (
            <View style={[styles.badge, styles.paidBadge, { marginTop: 3 }]}>
              <Text style={styles.paidText}>PAID</Text>
            </View>
          )}
        </View>
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <View>
          {business.address && <Text style={styles.businessDetail}>{business.address}</Text>}
          {business.city && <Text style={styles.businessDetail}>{business.city}{business.postcode ? `, ${business.postcode}` : ""}</Text>}
          {business.phone && <Text style={styles.businessDetail}>{business.phone}</Text>}
          {business.tax_number && <Text style={styles.businessDetail}>ABN: {business.tax_number}</Text>}
        </View>
      </View>
    </View>
  );

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {isModern ? <ModernHeader /> : <ClassicHeader />}
        {isMinimal && <View style={styles.minimalRule} />}

        {/* Bill To + Dates */}
        <View style={styles.section}>
          <View style={{ flex: 1, marginRight: 20 }}>
            <Text style={styles.billToLabel}>Bill To</Text>
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
          </View>
          <View style={{ width: 150 }}>
            <View style={styles.dateRow}><Text style={styles.dateLabel}>Issue date</Text><Text style={styles.dateValue}>{fmtDate(invoice.issue_date)}</Text></View>
            <View style={styles.dateRow}><Text style={styles.dateLabel}>Due date</Text><Text style={styles.dateValue}>{fmtDate(invoice.due_date)}</Text></View>
          </View>
        </View>

        {/* Line items */}
        <View style={styles.tableHeader}>
          <Text style={[styles.tableItem, styles.colHeader]}>Description</Text>
          <Text style={[styles.tableQty, styles.colHeader]}>Qty</Text>
          <Text style={[styles.tablePrice, styles.colHeader]}>Price</Text>
          <Text style={[styles.tableTax, styles.colHeader]}>{settings.label_tax}</Text>
          <Text style={[styles.tableTotal, styles.colHeader]}>Total</Text>
        </View>
        {lineItems.map((item) => (
          <View key={item.id} style={styles.tableRow}>
            <View style={styles.tableItem}>
              <Text style={styles.tableItemName}>{item.name}</Text>
              {item.description && <Text style={styles.tableItemDesc}>{item.description}</Text>}
            </View>
            <Text style={styles.tableQty}>{item.quantity}</Text>
            <Text style={styles.tablePrice}>{fmt(item.unit_price)}</Text>
            <Text style={styles.tableTax}>{item.tax_rate}%</Text>
            <Text style={styles.tableTotal}>{fmt(item.total)}</Text>
          </View>
        ))}

        {/* Totals */}
        <View style={styles.totalsSection}>
          <View style={styles.totalsBox}>
            <View style={styles.totalRow}><Text style={styles.totalLabel}>Subtotal</Text><Text>{fmt(invoice.subtotal)}</Text></View>
            {invoice.discount_amount > 0 && <View style={styles.totalRow}><Text style={styles.totalLabel}>Discount</Text><Text>- {fmt(invoice.discount_amount)}</Text></View>}
            <View style={styles.totalRow}><Text style={styles.totalLabel}>{settings.label_tax}</Text><Text>{fmt(invoice.tax_total)}</Text></View>
            <View style={styles.grandTotalRow}>
              <Text style={styles.grandTotalLabel}>Total</Text>
              <Text style={styles.grandTotalValue}>{fmt(invoice.total)}</Text>
            </View>
            {invoice.amount_paid > 0 && (
              <>
                <View style={[styles.totalRow, { marginTop: 8 }]}><Text style={{ color: "#16a34a" }}>Paid</Text><Text style={{ color: "#16a34a" }}>{fmt(invoice.amount_paid)}</Text></View>
                <View style={styles.totalRow}><Text style={styles.totalLabel}>Balance due</Text><Text style={{ fontFamily: "Helvetica-Bold" }}>{fmt(invoice.total - invoice.amount_paid)}</Text></View>
              </>
            )}
          </View>
        </View>

        {/* Footer: notes, terms, bank */}
        {(invoice.notes || invoice.terms || business.bank_account_name) && (
          <View style={styles.footer}>
            {invoice.notes && (
              <View style={styles.footerSection}>
                <Text style={styles.footerTitle}>Notes</Text>
                <Text style={styles.footerText}>{invoice.notes}</Text>
              </View>
            )}
            {invoice.terms && (
              <View style={styles.footerSection}>
                <Text style={styles.footerTitle}>Payment Terms</Text>
                <Text style={styles.footerText}>{invoice.terms}</Text>
              </View>
            )}
            {business.bank_account_name && (
              <View style={styles.footerSection}>
                <Text style={styles.footerTitle}>Payment Details</Text>
                {business.bank_name && <View style={styles.bankRow}><Text style={styles.bankLabel}>{settings.label_bank}</Text><Text style={styles.bankValue}>{business.bank_name}</Text></View>}
                <View style={styles.bankRow}><Text style={styles.bankLabel}>{settings.label_account_name}</Text><Text style={styles.bankValue}>{business.bank_account_name}</Text></View>
                {business.bank_account_number && <View style={styles.bankRow}><Text style={styles.bankLabel}>{settings.label_account_number}</Text><Text style={styles.bankValue}>{business.bank_account_number}</Text></View>}
                {business.bank_sort_code && <View style={styles.bankRow}><Text style={styles.bankLabel}>{settings.label_bsb}</Text><Text style={styles.bankValue}>{business.bank_sort_code}</Text></View>}
              </View>
            )}
          </View>
        )}
      </Page>
    </Document>
  );
}
