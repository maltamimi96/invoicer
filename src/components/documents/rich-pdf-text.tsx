import { Text, View } from "@react-pdf/renderer";

// Lightweight rich text for @react-pdf. Supports what template custom fields
// need without a full markdown/HTML engine (which @react-pdf can't render):
//   - new lines               → line breaks
//   - blank line              → paragraph gap
//   - line starting "- " / "• " → bullet
//   - **bold** inline runs    → bold
// Anything else is plain text.

function parseBold(s: string): { text: string; bold: boolean }[] {
  return s
    .split(/\*\*/)
    .map((t, i) => ({ text: t, bold: i % 2 === 1 }))
    .filter((p) => p.text.length > 0);
}

export function RichPdfText({ text, style, boldStyle, bulletColor }: {
  text: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  style?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  boldStyle?: any;
  bulletColor?: string;
}) {
  const lines = (text ?? "").split("\n");
  return (
    <View>
      {lines.map((line, i) => {
        if (line.trim() === "") return <View key={i} style={{ height: 5 }} />;
        const bullet = /^\s*[-•]\s+/.test(line);
        const content = bullet ? line.replace(/^\s*[-•]\s+/, "") : line;
        const runs = parseBold(content);
        return (
          <View key={i} style={{ flexDirection: "row" }}>
            {bullet && <Text style={[style, { marginRight: 4, color: bulletColor ?? undefined }]}>•</Text>}
            <Text style={[style, { flex: 1 }]}>
              {runs.map((r, j) => (r.bold ? <Text key={j} style={boldStyle}>{r.text}</Text> : r.text))}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
