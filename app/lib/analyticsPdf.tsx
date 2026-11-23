// A clean one-page Analytics summary PDF for a pro or a shop, in the same
// look as the earnings statement (app/lib/earningsPdf.tsx). The figures are
// passed in from the same section data the screen shows.

import { Document, Page, Path, StyleSheet, Svg, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { LU_MARK_PATHS, LU_MARK_VIEWBOX } from "./luMarkPaths";

const INK = "#0a0a0a";
const PAPER = "#f5f5f3";
const MUTED = "#6b6b6b";
const RULE = "#e4e4e1";

const s = StyleSheet.create({
  page: { paddingBottom: 48, fontFamily: "Helvetica", fontSize: 9, color: INK, backgroundColor: "#ffffff" },
  band: { backgroundColor: INK, paddingHorizontal: 40, paddingVertical: 20, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  brand: { flexDirection: "row", alignItems: "center" },
  wordmark: { color: "#ffffff", fontFamily: "Helvetica-Bold", fontSize: 16, marginLeft: 8 },
  bandTitle: { color: "#ffffff", fontFamily: "Helvetica-Bold", fontSize: 12, textAlign: "right" },
  bandSub: { color: "#bdbdbd", fontSize: 8.5, marginTop: 3, textAlign: "right" },
  body: { paddingHorizontal: 40, paddingTop: 20 },
  name: { fontFamily: "Helvetica-Bold", fontSize: 14 },
  sub: { fontSize: 8.5, color: MUTED, marginTop: 3, marginBottom: 16 },
  kpis: { flexDirection: "row", flexWrap: "wrap", marginBottom: 6 },
  kpi: { width: "31.5%", backgroundColor: PAPER, borderRadius: 8, padding: 11, marginRight: "2.5%", marginBottom: 8 },
  kpiLabel: { fontSize: 7.5, color: MUTED },
  kpiValue: { fontFamily: "Helvetica-Bold", fontSize: 14, marginTop: 4 },
  kpiDelta: { fontSize: 7.5, color: MUTED, marginTop: 2 },
  h2: { fontFamily: "Helvetica-Bold", fontSize: 10.5, marginTop: 12, marginBottom: 5 },
  row: { flexDirection: "row", borderBottomWidth: 0.6, borderBottomColor: RULE, paddingVertical: 4.5 },
  cell: { flex: 1 },
  amt: { width: 90, textAlign: "right" },
  note: { fontSize: 8.5, lineHeight: 1.45, color: "#333333" },
  footer: { position: "absolute", bottom: 20, left: 40, right: 40, fontSize: 7, color: MUTED, borderTopWidth: 0.6, borderTopColor: RULE, paddingTop: 6 },
});

export type SummaryInput = {
  scope: "me" | "shop";
  name: string;
  from: string;
  to: string;
  compareLabel: string;
  kpis: { label: string; value: string; delta: string }[];
  tables: { title: string; rows: { label: string; value: string }[] }[];
  suggestions: string[];
};

function Mark() {
  return (
    <Svg viewBox={LU_MARK_VIEWBOX} width={26} height={18}>
      {LU_MARK_PATHS.map((d, i) => (
        <Path key={i} d={d} fill="#ffffff" />
      ))}
    </Svg>
  );
}

function SummaryDoc(p: SummaryInput) {
  return (
    <Document title={`${p.name} Analytics ${p.from} to ${p.to}`} author="LineUp">
      <Page size="LETTER" style={s.page}>
        <View style={s.band}>
          <View style={s.brand}>
            <Mark />
            <Text style={s.wordmark}>LineUp</Text>
          </View>
          <View>
            <Text style={s.bandTitle}>{p.scope === "shop" ? "Shop analytics summary" : "Analytics summary"}</Text>
            <Text style={s.bandSub}>
              {p.from} to {p.to}
            </Text>
          </View>
        </View>
        <View style={s.body}>
          <Text style={s.name}>{p.name}</Text>
          <Text style={s.sub}>Compared with the {p.compareLabel}. Revenue is service sales after refunds, counted the same way as Earnings.</Text>
          <View style={s.kpis}>
            {p.kpis.map((k) => (
              <View key={k.label} style={s.kpi}>
                <Text style={s.kpiLabel}>{k.label}</Text>
                <Text style={s.kpiValue}>{k.value}</Text>
                <Text style={s.kpiDelta}>{k.delta}</Text>
              </View>
            ))}
          </View>
          {p.tables.map((t) => (
            <View key={t.title} wrap={false}>
              <Text style={s.h2}>{t.title}</Text>
              {t.rows.map((r) => (
                <View key={r.label} style={s.row}>
                  <Text style={s.cell}>{r.label}</Text>
                  <Text style={s.amt}>{r.value}</Text>
                </View>
              ))}
            </View>
          ))}
          {p.suggestions.length ? (
            <View wrap={false}>
              <Text style={s.h2}>What to do next</Text>
              {p.suggestions.slice(0, 4).map((x) => (
                <Text key={x} style={[s.note, { marginBottom: 4 }]}>
                  {x}
                </Text>
              ))}
            </View>
          ) : null}
        </View>
        <Text style={s.footer} fixed>
          LineUp · lineup-aesthetics.ca · Made {new Date().toLocaleDateString("en-CA", { timeZone: "America/Winnipeg" })}
        </Text>
      </Page>
    </Document>
  );
}

export async function renderAnalyticsSummaryPdf(input: SummaryInput) {
  return renderToBuffer(<SummaryDoc {...input} />);
}
