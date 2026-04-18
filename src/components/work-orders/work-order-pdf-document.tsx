import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import type { Business, WorkOrder, JobPhoto, JobTimelineEvent, JobSignature, JobDocument } from "@/types/database";

interface Props {
  workOrder: WorkOrder;
  business: Business;
  customerName: string | null;
  siteLine: string | null;
  photos: JobPhoto[];
  timeline: JobTimelineEvent[];
  signatures: JobSignature[];
  documents: JobDocument[];
}

const fmtDate = (s: string | null) => s
  ? new Date(s).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })
  : "—";

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 10, fontFamily: "Helvetica", color: "#111827" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16, paddingBottom: 12, borderBottom: "1px solid #e5e7eb" },
  brand: { fontSize: 16, fontWeight: "bold" },
  number: { fontSize: 10, color: "#6b7280" },
  title: { fontSize: 18, fontWeight: "bold", marginBottom: 4 },
  meta: { color: "#6b7280", marginBottom: 12 },
  section: { marginTop: 14 },
  sectionTitle: { fontSize: 11, fontWeight: "bold", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5, color: "#374151" },
  row: { flexDirection: "row", marginBottom: 3 },
  label: { width: 90, color: "#6b7280" },
  val: { flex: 1 },
  bullet: { marginBottom: 3 },
  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  photo: { width: 120, height: 90, marginRight: 4, marginBottom: 4, objectFit: "cover" },
  phaseLabel: { fontSize: 9, color: "#6b7280", marginTop: 6, marginBottom: 4 },
  sigBox: { flexDirection: "row", alignItems: "center", marginBottom: 8, gap: 8 },
  sigImg: { width: 100, height: 40, objectFit: "contain" },
  footer: { position: "absolute", bottom: 24, left: 36, right: 36, fontSize: 8, color: "#9ca3af", textAlign: "center" },
});

export function WorkOrderPDFDocument({
  workOrder, business, customerName, siteLine, photos, timeline, signatures, documents,
}: Props) {
  const accent = business.accent_color || "#B8860B";
  const phases: ("before" | "during" | "after")[] = ["before", "during", "after"];

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={[styles.brand, { color: accent }]}>{business.name}</Text>
            {business.email && <Text style={{ fontSize: 9, color: "#6b7280" }}>{business.email}</Text>}
          </View>
          <Text style={styles.number}>{workOrder.number}</Text>
        </View>

        <Text style={styles.title}>{workOrder.title}</Text>
        <Text style={styles.meta}>Status: {String(workOrder.status).replace(/_/g, " ")}</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Job details</Text>
          {customerName && <View style={styles.row}><Text style={styles.label}>Customer</Text><Text style={styles.val}>{customerName}</Text></View>}
          {siteLine && <View style={styles.row}><Text style={styles.label}>Site</Text><Text style={styles.val}>{siteLine}</Text></View>}
          {workOrder.scheduled_date && <View style={styles.row}><Text style={styles.label}>Scheduled</Text><Text style={styles.val}>{new Date(workOrder.scheduled_date).toLocaleDateString("en-AU")}</Text></View>}
          {workOrder.started_at && <View style={styles.row}><Text style={styles.label}>Started</Text><Text style={styles.val}>{fmtDate(workOrder.started_at)}</Text></View>}
          {workOrder.completed_at && <View style={styles.row}><Text style={styles.label}>Completed</Text><Text style={styles.val}>{fmtDate(workOrder.completed_at)}</Text></View>}
          {workOrder.reported_issue && <View style={styles.row}><Text style={styles.label}>Reported</Text><Text style={styles.val}>{workOrder.reported_issue}</Text></View>}
          {workOrder.scope_of_work && <View style={styles.row}><Text style={styles.label}>Scope</Text><Text style={styles.val}>{workOrder.scope_of_work}</Text></View>}
        </View>

        {photos.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Photos</Text>
            {phases.map((phase) => {
              const list = photos.filter((p) => p.phase === phase);
              if (list.length === 0) return null;
              return (
                <View key={phase} wrap={false}>
                  <Text style={styles.phaseLabel}>{phase.toUpperCase()} ({list.length})</Text>
                  <View style={styles.photoGrid}>
                    {list.slice(0, 9).map((p) => (
                      // eslint-disable-next-line jsx-a11y/alt-text
                      <Image key={p.id} src={p.url} style={styles.photo} />
                    ))}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {timeline.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Activity</Text>
            {timeline.slice(0, 25).map((e) => (
              <Text key={e.id} style={styles.bullet}>
                · {fmtDate(e.created_at)} — {String(e.type).replace(/_/g, " ")}
              </Text>
            ))}
          </View>
        )}

        {documents.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Documents</Text>
            {documents.map((d) => (
              <Text key={d.id} style={styles.bullet}>· {d.name}</Text>
            ))}
          </View>
        )}

        {signatures.length > 0 && (
          <View style={styles.section} wrap={false}>
            <Text style={styles.sectionTitle}>Sign-off</Text>
            {signatures.map((s) => (
              <View key={s.id} style={styles.sigBox}>
                {/* eslint-disable-next-line jsx-a11y/alt-text */}
                <Image src={s.signature_url} style={styles.sigImg} />
                <View>
                  <Text>{s.signed_by_name}{s.signed_by_role ? ` (${s.signed_by_role})` : ""}</Text>
                  <Text style={{ fontSize: 8, color: "#6b7280" }}>{s.purpose} · {fmtDate(s.signed_at)}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        <Text style={styles.footer} fixed>
          {business.name} · {workOrder.number} · Generated {new Date().toLocaleDateString("en-AU")}
        </Text>
      </Page>
    </Document>
  );
}
