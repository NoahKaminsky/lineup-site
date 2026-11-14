// The earnings statement as a PDF: a year-end (or monthly) income statement
// for a pro or a shop, in LineUp's look, with what an accountant and the CRA
// would ask for: who the seller is, gross income, costs, net, how the money
// came in, the quarterly figures LineUp may report under the platform rules,
// anything that needs fixing, and every sale behind the totals.

import { Document, Page, Path, StyleSheet, Svg, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { AttentionItem, EarningsRow, Seller } from "./earnings";
import { PAID_LABEL, TYPE_LABEL, buildStatement, byMonth, byPro, money, quarters, type Line, type Scope } from "./earningsStatement";
import { LU_MARK_PATHS, LU_MARK_VIEWBOX } from "./luMarkPaths";

const INK = "#0a0a0a";
const PAPER = "#f5f5f3";
const SIGNAL = "#C8102E";
const MUTED = "#6b6b6b";
const RULE = "#e4e4e1";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const s = StyleSheet.create({
  page: { paddingTop: 0, paddingBottom: 56, paddingHorizontal: 0, fontFamily: "Helvetica", fontSize: 9, color: INK, backgroundColor: "#ffffff" },
  body: { paddingHorizontal: 40 },
  band: { backgroundColor: INK, paddingHorizontal: 40, paddingVertical: 22, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  brand: { flexDirection: "row", alignItems: "center" },
  wordmark: { color: "#ffffff", fontFamily: "Helvetica-Bold", fontSize: 16, marginLeft: 8, letterSpacing: -0.4 },
  bandRight: { alignItems: "flex-end" },
  bandTitle: { color: "#ffffff", fontFamily: "Helvetica-Bold", fontSize: 12 },
  bandSub: { color: "#bdbdbd", fontSize: 8.5, marginTop: 3 },
  signalRule: { height: 3, backgroundColor: SIGNAL },
  slimBand: { backgroundColor: INK, paddingHorizontal: 40, paddingVertical: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 18 },
  slimText: { color: "#ffffff", fontSize: 8.5 },
  seller: { flexDirection: "row", marginTop: 22, marginBottom: 18 },
  sellerCol: { flex: 1, paddingRight: 16 },
  label: { fontSize: 7, color: MUTED, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 3 },
  sellerName: { fontFamily: "Helvetica-Bold", fontSize: 13, marginBottom: 3 },
  small: { fontSize: 8.5, color: "#333333", lineHeight: 1.45 },
  muted: { color: MUTED },
  kpis: { flexDirection: "row", marginBottom: 20 },
  kpi: { flex: 1, backgroundColor: PAPER, borderRadius: 8, padding: 12, marginRight: 8 },
  kpiStrong: { flex: 1, backgroundColor: INK, borderRadius: 8, padding: 12, marginRight: 8 },
  kpiLabel: { fontSize: 7.5, color: MUTED },
  kpiLabelStrong: { fontSize: 7.5, color: "#bdbdbd" },
  kpiValue: { fontFamily: "Helvetica-Bold", fontSize: 15, marginTop: 4 },
  kpiValueStrong: { fontFamily: "Helvetica-Bold", fontSize: 15, marginTop: 4, color: "#ffffff" },
  h2: { fontFamily: "Helvetica-Bold", fontSize: 11, marginBottom: 6, marginTop: 14 },
  intro: { fontSize: 8, color: MUTED, marginBottom: 6, lineHeight: 1.4 },
  row: { flexDirection: "row", borderBottomWidth: 0.6, borderBottomColor: RULE, paddingVertical: 5 },
  rowTotal: { flexDirection: "row", paddingVertical: 6, borderTopWidth: 1, borderTopColor: INK },
  cellLabel: { flex: 1 },
  cellNote: { fontSize: 7.5, color: MUTED, marginTop: 1.5 },
  cellAmt: { width: 90, textAlign: "right" },
  bold: { fontFamily: "Helvetica-Bold" },
  th: { fontSize: 7, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5 },
  twoCol: { flexDirection: "row" },
  col: { flex: 1 },
  colGap: { width: 18 },
  callout: { backgroundColor: PAPER, borderLeftWidth: 2.5, borderLeftColor: SIGNAL, padding: 10, marginTop: 10, borderRadius: 4 },
  footer: { position: "absolute", bottom: 22, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: MUTED, borderTopWidth: 0.6, borderTopColor: RULE, paddingTop: 6 },
  tx: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: RULE, paddingVertical: 3.5, fontSize: 7 },
});

function Mark({ size = 22, color = "#ffffff" }: { size?: number; color?: string }) {
  return (
    <Svg viewBox={LU_MARK_VIEWBOX} style={{ width: size * (545 / 410), height: size }}>
      {LU_MARK_PATHS.map((d, i) => (
        <Path key={i} d={d} fill={color} />
      ))}
    </Svg>
  );
}

function Table({ lines, total, totalLabel }: { lines: Line[]; total?: number; totalLabel?: string }) {
  return (
    <View>
      {lines.length === 0 ? (
        <View style={s.row}>
          <Text style={[s.cellLabel, s.muted]}>None</Text>
        </View>
      ) : (
        lines.map((l) => (
          <View key={l.label} style={s.row} wrap={false}>
            <View style={s.cellLabel}>
              <Text>{l.label}</Text>
              {l.note ? <Text style={s.cellNote}>{l.note}</Text> : null}
            </View>
            <Text style={s.cellAmt}>{money(l.cents)}</Text>
          </View>
        ))
      )}
      {totalLabel !== undefined && total !== undefined ? (
        <View style={s.rowTotal} wrap={false}>
          <Text style={[s.cellLabel, s.bold]}>{totalLabel}</Text>
          <Text style={[s.cellAmt, s.bold]}>{money(total)}</Text>
        </View>
      ) : null}
    </View>
  );
}

function Grid({ head, widths, rows, align }: { head: string[]; widths: (number | "flex")[]; rows: string[][]; align?: ("left" | "right")[] }) {
  const style = (i: number) => {
    const w = widths[i];
    return { ...(w === "flex" ? { flex: 1 } : { width: w }), textAlign: align?.[i] || (i === 0 ? "left" : "right") } as const;
  };
  return (
    <View>
      <View style={[s.row, { borderBottomColor: INK }]} fixed>
        {head.map((h, i) => (
          <Text key={h} style={[s.th, style(i)]}>
            {h}
          </Text>
        ))}
      </View>
      {rows.map((r, ri) => (
        <View key={ri} style={s.row} wrap={false}>
          {r.map((c, i) => (
            <Text key={i} style={[style(i), ri === rows.length - 1 && c.startsWith("Total") ? s.bold : {}]}>
              {c}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

function Footer({ id }: { id: string }) {
  return (
    <View style={s.footer} fixed>
      <Text>LineUp  |  lineup-aesthetics.ca  |  Statement {id}</Text>
      <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
    </View>
  );
}

function SlimHeader({ seller, period }: { seller: Seller; period: string }) {
  return (
    <View style={s.slimBand} fixed>
      <View style={s.brand}>
        <Mark size={12} />
        <Text style={[s.slimText, { marginLeft: 6, fontFamily: "Helvetica-Bold" }]}>LineUp</Text>
      </View>
      <Text style={s.slimText}>
        {seller.name}  |  Earnings statement  |  {period}
      </Text>
    </View>
  );
}

export type StatementInput = {
  scope: Scope;
  year: number;
  month: number | null; // 0-11, or null for the whole year
  seller: Seller;
  rows: EarningsRow[];
  attention: AttentionItem[];
  legalName?: string | null;
  gstNumber?: string | null;
};

function StatementDoc(input: StatementInput) {
  const { scope, year, month, seller, attention } = input;
  const monthKey = month === null ? null : `${year}-${String(month + 1).padStart(2, "0")}`;
  const rows = monthKey ? input.rows.filter((r) => r.date.startsWith(monthKey)) : input.rows;
  const att = monthKey ? attention.filter((a) => a.date.startsWith(monthKey)) : attention;
  const st = buildStatement(rows, scope);
  const period = month === null ? `January 1 to December 31, ${year}` : `${MONTHS[month]} ${year}`;
  const periodShort = month === null ? String(year) : `${MONTHS[month].slice(0, 3)} ${year}`;
  const generated = new Date().toLocaleDateString("en-CA", { timeZone: "America/Winnipeg", year: "numeric", month: "long", day: "numeric" });
  const statementId = `${seller.accountId.slice(0, 8).toUpperCase()}-${monthKey ? monthKey.replace("-", "") : year}`;
  const qs = quarters(rows, scope);
  const months = month === null ? byMonth(rows, scope).filter((m) => m.gross || m.costs) : [];
  const pros = scope === "shop" ? byPro(rows) : [];
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Winnipeg" });
  const partial = month === null ? year === Number(today.slice(0, 4)) : monthKey === today.slice(0, 7);
  const detail = rows;

  return (
    <Document title={`LineUp earnings statement ${periodShort} – ${seller.name}`} author="LineUp" subject="Earnings statement" creator="LineUp">
      <Page size="LETTER" style={s.page}>
        <View style={s.band}>
          <View style={s.brand}>
            <Mark size={22} />
            <Text style={s.wordmark}>LineUp</Text>
          </View>
          <View style={s.bandRight}>
            <Text style={s.bandTitle}>{scope === "shop" ? "Shop earnings statement" : "Earnings statement"}</Text>
            <Text style={s.bandSub}>{period}</Text>
          </View>
        </View>
        <View style={s.signalRule} />

        <View style={s.body}>
          <View style={s.seller}>
            <View style={s.sellerCol}>
              <Text style={s.label}>{scope === "shop" ? "Shop" : "Professional"}</Text>
              <Text style={s.sellerName}>{input.legalName || seller.name}</Text>
              {input.legalName && input.legalName !== seller.name ? <Text style={s.small}>On LineUp as {seller.name}</Text> : null}
              {seller.businessName ? <Text style={s.small}>{seller.businessName}</Text> : null}
              {seller.address ? <Text style={s.small}>{seller.address}</Text> : null}
              {seller.email ? <Text style={s.small}>{seller.email}</Text> : null}
              {seller.phone ? <Text style={s.small}>{seller.phone}</Text> : null}
            </View>
            <View style={s.sellerCol}>
              <Text style={s.label}>Statement</Text>
              <Text style={s.small}>Period: {period}</Text>
              <Text style={s.small}>Issued: {generated}</Text>
              <Text style={s.small}>Statement no.: {statementId}</Text>
              <Text style={s.small}>LineUp account: {seller.accountId}</Text>
              {scope === "me" && seller.shopName ? <Text style={s.small}>Works at: {seller.shopName}</Text> : null}
              <Text style={s.small}>GST/HST no.: {input.gstNumber || "Not provided"}</Text>
              <Text style={s.small}>Currency: Canadian dollars (CAD)</Text>
            </View>
          </View>

          {partial ? (
            <View style={[s.callout, { marginTop: 0, marginBottom: 14 }]}>
              <Text style={s.small}>
                This period isn&apos;t over yet. Figures run to {today}; download a new statement once it ends.
              </Text>
            </View>
          ) : null}

          <View style={s.kpis}>
            <View style={s.kpiStrong}>
              <Text style={s.kpiLabelStrong}>Net income</Text>
              <Text style={s.kpiValueStrong}>{money(st.net)}</Text>
            </View>
            <View style={s.kpi}>
              <Text style={s.kpiLabel}>Gross income</Text>
              <Text style={s.kpiValue}>{money(st.grossIncome)}</Text>
            </View>
            <View style={[s.kpi, { marginRight: 0 }]}>
              <Text style={s.kpiLabel}>Costs</Text>
              <Text style={s.kpiValue}>{money(st.totalCosts)}</Text>
            </View>
          </View>

          <Text style={s.h2}>1. Gross income</Text>
          <Text style={s.intro}>
            {scope === "shop"
              ? "The shop's own income. Team members' sales are theirs and appear in section 6."
              : "Everything clients paid you for, before any fees or commission. Each dollar is counted once."}
          </Text>
          <Table lines={st.income} total={st.grossIncome} totalLabel="Gross income (generally T2125, line 8299)" />

          <Text style={s.h2}>2. Costs</Text>
          <Text style={s.intro}>
            Fees and rent LineUp recorded, plus any expenses you added.{scope === "me" ? " Booth rent is generally claimed on T2125, line 8910." : ""} Expenses you
            haven&apos;t added in LineUp still belong on your return.
          </Text>
          <Table lines={st.costs} total={st.totalCosts} totalLabel="Total costs" />

          <View style={[s.rowTotal, { marginTop: 8, borderTopWidth: 1.5 }]} wrap={false}>
            <Text style={[s.cellLabel, s.bold, { fontSize: 10.5 }]}>Net income from LineUp records</Text>
            <Text style={[s.cellAmt, s.bold, { fontSize: 10.5 }]}>{money(st.net)}</Text>
          </View>

          {st.memo.length ? (
            <>
              <Text style={s.h2}>For reference (not added again)</Text>
              <Table lines={st.memo} />
            </>
          ) : null}
        </View>
        <Footer id={statementId} />
      </Page>

      <Page size="LETTER" style={s.page}>
        <SlimHeader seller={seller} period={periodShort} />
        <View style={s.body}>
          <Text style={[s.h2, { marginTop: 0 }]}>3. Appointments by how they came in</Text>
          <Text style={s.intro}>Every appointment in LineUp for the period, counted once. Amounts include tips.</Text>
          <Grid
            head={["Booking type", "Appointments", "Amount"]}
            widths={["flex", 80, 90]}
            rows={[
              ...st.activity.map((a) => [a.label, String(a.count), money(a.cents)]),
              ["Total", String(st.activity.reduce((n, a) => n + a.count, 0)), money(st.activity.reduce((n, a) => n + a.cents, 0))],
            ]}
          />

          <Text style={s.h2}>4. How the money arrived</Text>
          <Text style={s.intro}>Payouts from LineUp go to the bank account linked to Stripe. Money collected at the shop is what was recorded when each appointment was marked done.</Text>
          <Table lines={st.received} />

          <Text style={s.h2}>5. Paid through LineUp, by quarter</Text>
          <Text style={s.intro}>
            Under the CRA&apos;s reporting rules for digital platforms (Part XX of the Income Tax Act), a platform may report each seller&apos;s total
            payments and the fees it withheld, by calendar quarter. These are LineUp&apos;s figures for you. Walk-ins and other payments taken at
            the shop are not included.
          </Text>
          {month === null ? (
          <Grid
              head={["Quarter", "Transactions", "Paid by clients", "LineUp fees", "Net"]}
              widths={["flex", 70, 90, 80, 80]}
              rows={[
                ...qs.map((q) => [`Q${q.quarter} (${MONTHS[(q.quarter - 1) * 3].slice(0, 3)}–${MONTHS[q.quarter * 3 - 1].slice(0, 3)})`, String(q.count), money(q.paid), money(q.fees), money(q.net)]),
                [
                  "Total",
                  String(qs.reduce((n, q) => n + q.count, 0)),
                  money(qs.reduce((n, q) => n + q.paid, 0)),
                  money(qs.reduce((n, q) => n + q.fees, 0)),
                  money(qs.reduce((n, q) => n + q.net, 0)),
                ],
              ]}
            />
          ) : (
            <Text style={s.intro}>Quarterly figures are on the full-year statement.</Text>
          )}

          <View style={s.callout} wrap={false}>
            <Text style={[s.small, s.bold]}>GST/HST</Text>
            <Text style={s.small}>
              Taxable sales this period: {money(st.taxableSales)} (services{scope === "shop" ? ", commission, rent, memberships and products" : ", products and no-show fees"}; tips
              and gift card sales left out). LineUp doesn&apos;t add GST/HST to prices. If you&apos;re registered, the GST/HST you owe is included in these
              amounts. You must register once taxable sales pass $30,000 in four calendar quarters in a row.
            </Text>
          </View>

          {months.length > 1 ? (
            <>
              <Text style={s.h2}>Month by month</Text>
              <Grid
                head={["Month", "Gross income", "Costs", "Net income"]}
                widths={["flex", 90, 90, 90]}
                rows={[
                  ...months.map((m) => [MONTHS[m.month], money(m.gross), money(m.costs), money(m.net)]),
                  ["Total", money(st.grossIncome), money(st.totalCosts), money(st.net)],
                ]}
              />
            </>
          ) : null}

          {pros.length ? (
            <>
              <Text style={s.h2}>6. Team sales, by pro</Text>
              <Text style={s.intro}>
                Each pro&apos;s sales through the shop. Each pro reports their own income; booth renters keep their sales and pay rent instead.
              </Text>
              <Grid
                head={["Pro", "Appts", "Sales", "Tips", "At shop", "LineUp fees", "To shop", "To pro"]}
                widths={["flex", 34, 62, 52, 58, 56, 58, 62]}
                rows={[
                  ...pros.map((p) => [p.name, String(p.count), money(p.sales), money(p.tips), money(p.atShop), money(p.fees), money(p.toShop), money(p.toPro)]),
                  [
                    "Total",
                    String(pros.reduce((n, p) => n + p.count, 0)),
                    money(pros.reduce((n, p) => n + p.sales, 0)),
                    money(pros.reduce((n, p) => n + p.tips, 0)),
                    money(pros.reduce((n, p) => n + p.atShop, 0)),
                    money(pros.reduce((n, p) => n + p.fees, 0)),
                    money(pros.reduce((n, p) => n + p.toShop, 0)),
                    money(pros.reduce((n, p) => n + p.toPro, 0)),
                  ],
                ]}
              />
            </>
          ) : null}

          <Text style={s.h2}>{att.length ? `Needs attention (${att.length})` : "Needs attention"}</Text>
          {att.length ? (
            <>
              <Text style={s.intro}>These may keep the totals above from being complete. Fix them in LineUp and download a new statement.</Text>
              <Grid
                head={["Date", "Appointment", "Issue"]}
                widths={[56, 170, "flex"]}
                align={["left", "left", "left"]}
                rows={att.map((a) => [a.date, `${a.item}${scope === "shop" && a.proName ? ` (${a.proName})` : ""}`, a.issue])}
              />
            </>
          ) : (
            <Text style={s.intro}>Nothing. Every appointment in the period is marked done, no-show or cancelled.</Text>
          )}

          <View style={[s.callout, { marginTop: 16 }]} wrap={false}>
            <Text style={s.small}>
              How this is counted: online bookings count on the appointment date, at the price the client paid. A gift card counts when it&apos;s
              sold, so a booking paid with one isn&apos;t counted again. Memberships and booth rent count when each payment goes through. Refunded
              bookings are left out. Cash or other income you didn&apos;t record in LineUp still belongs on your return. This statement is a record
              of your activity on LineUp, not tax advice; check with an accountant.
            </Text>
          </View>
        </View>
        <Footer id={statementId} />
      </Page>

      <Page size="LETTER" style={s.page}>
        <SlimHeader seller={seller} period={periodShort} />
        <View style={s.body}>
          <Text style={[s.h2, { marginTop: 0 }]}>Every transaction ({detail.length})</Text>
          <Text style={s.intro}>
            Each line balances: price + tip - gift card - LineUp fee = to shop + to {scope === "shop" ? "pro" : "you"}. Costs you paid (booth rent, LineUp
            plan) show as negative.
          </Text>
          <View style={[s.tx, { borderBottomColor: INK }]} fixed>
            <Text style={[s.th, { width: 44 }]}>Date</Text>
            <Text style={[s.th, { flex: 1 }]}>Item</Text>
            <Text style={[s.th, { width: 60 }]}>Paid</Text>
            <Text style={[s.th, { width: 44, textAlign: "right" }]}>Price</Text>
            <Text style={[s.th, { width: 36, textAlign: "right" }]}>Tip</Text>
            <Text style={[s.th, { width: 40, textAlign: "right" }]}>Gift card</Text>
            <Text style={[s.th, { width: 40, textAlign: "right" }]}>Fee</Text>
            <Text style={[s.th, { width: 46, textAlign: "right" }]}>To shop</Text>
            <Text style={[s.th, { width: 48, textAlign: "right" }]}>{scope === "shop" ? "To pro" : "To you"}</Text>
          </View>
          {detail.length === 0 ? <Text style={[s.intro, { marginTop: 6 }]}>No transactions in this period.</Text> : null}
          {detail.map((r) => (
            <View key={r.id} style={s.tx} wrap={false}>
              <Text style={{ width: 44 }}>{r.date.slice(5)}</Text>
              <View style={{ flex: 1, paddingRight: 4 }}>
                <Text>{r.item}</Text>
                <Text style={{ color: MUTED, fontSize: 6.5, marginTop: 1 }}>
                  {[TYPE_LABEL[r.type], r.channel === "request" ? "from a request" : r.channel === "regular" ? "regular" : null, scope === "shop" ? r.proName : null, r.client]
                    .filter(Boolean)
                    .join(", ")}
                  {r.estimated ? ", shop share estimated" : ""}
                </Text>
              </View>
              <Text style={{ width: 60 }}>{r.paidVia === "at_shop" ? "At shop" : PAID_LABEL[r.paidVia]}</Text>
              <Text style={{ width: 44, textAlign: "right" }}>{money(r.priceCents)}</Text>
              <Text style={{ width: 36, textAlign: "right" }}>{r.tipCents ? money(r.tipCents) : "–"}</Text>
              <Text style={{ width: 40, textAlign: "right" }}>{r.giftCents ? money(r.giftCents) : "–"}</Text>
              <Text style={{ width: 40, textAlign: "right" }}>{r.lineupFeeCents ? money(r.lineupFeeCents) : "–"}</Text>
              <Text style={{ width: 46, textAlign: "right" }}>{r.toShopCents ? money(r.toShopCents) : "–"}</Text>
              <Text style={{ width: 48, textAlign: "right" }}>{r.toProCents ? money(r.toProCents) : "–"}</Text>
            </View>
          ))}
        </View>
        <Footer id={statementId} />
      </Page>
    </Document>
  );
}

export async function renderStatementPdf(input: StatementInput) {
  return renderToBuffer(<StatementDoc {...input} />);
}
