import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";

export interface ContractPdfProps {
  title: string;
  businessName: string;
  /** Body paragraphs (rich-text contracts). Empty for uploaded-PDF contracts. */
  paragraphs: string[];
  /** Note shown when the contract body is a separately-attached PDF. */
  attachmentNote?: string | null;
  signerName: string;
  signedAtLabel: string;
  /** Data URL of the drawn signature image, if drawn. */
  signatureImage?: string | null;
  signatureMethod: "typed" | "drawn";
  audit: { ip?: string | null; userAgent?: string | null; contractId: string };
}

const C = {
  text: "#0f172a", muted: "#64748b", border: "#e2e8f0", primary: "#4f46e5", light: "#f8fafc",
};

const styles = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 10, color: C.text, padding: 48, lineHeight: 1.5 },
  brand: { fontSize: 9, color: C.muted, marginBottom: 4 },
  title: { fontSize: 20, fontFamily: "Helvetica-Bold", marginBottom: 16 },
  rule: { borderBottomWidth: 1, borderBottomColor: C.border, marginBottom: 16 },
  para: { marginBottom: 8 },
  attachment: { fontStyle: "italic", color: C.muted, marginBottom: 8 },
  sigBlock: { marginTop: 28, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 16 },
  sigLabel: { fontSize: 8, textTransform: "uppercase", letterSpacing: 1, color: C.muted, marginBottom: 6 },
  sigImage: { width: 200, height: 70, objectFit: "contain" },
  sigTyped: { fontSize: 22, fontFamily: "Helvetica-Oblique", color: C.text },
  sigName: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 6 },
  meta: { fontSize: 8, color: C.muted, marginTop: 2 },
  cert: { marginTop: 28, backgroundColor: C.light, borderWidth: 1, borderColor: C.border, borderRadius: 4, padding: 12 },
  certTitle: { fontSize: 8, textTransform: "uppercase", letterSpacing: 1, color: C.muted, marginBottom: 6, fontFamily: "Helvetica-Bold" },
  certRow: { fontSize: 8, color: C.muted, marginBottom: 2 },
});

export function ContractPdfDocument(props: ContractPdfProps) {
  const {
    title, businessName, paragraphs, attachmentNote, signerName, signedAtLabel,
    signatureImage, signatureMethod, audit,
  } = props;
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.brand}>{businessName}</Text>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.rule} />

        {attachmentNote ? <Text style={styles.attachment}>{attachmentNote}</Text> : null}
        {paragraphs.map((p, i) => (
          <Text key={i} style={styles.para}>{p}</Text>
        ))}

        <View style={styles.sigBlock} wrap={false}>
          <Text style={styles.sigLabel}>Signature</Text>
          {signatureMethod === "drawn" && signatureImage ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image src={signatureImage} style={styles.sigImage} />
          ) : (
            <Text style={styles.sigTyped}>{signerName}</Text>
          )}
          <Text style={styles.sigName}>{signerName}</Text>
          <Text style={styles.meta}>Signed {signedAtLabel}</Text>
        </View>

        <View style={styles.cert} wrap={false}>
          <Text style={styles.certTitle}>Signature certificate</Text>
          <Text style={styles.certRow}>Signer: {signerName}</Text>
          <Text style={styles.certRow}>Method: electronic signature ({signatureMethod})</Text>
          <Text style={styles.certRow}>Signed at: {signedAtLabel}</Text>
          {audit.ip ? <Text style={styles.certRow}>IP address: {audit.ip}</Text> : null}
          {audit.userAgent ? <Text style={styles.certRow}>Device: {audit.userAgent}</Text> : null}
          <Text style={styles.certRow}>Reference: {audit.contractId}</Text>
        </View>
      </Page>
    </Document>
  );
}
