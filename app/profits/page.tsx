import Link from "next/link";
import "./profits.css";

type ProfitRow = {
  symbol: string;
  name?: string;
  market: "US" | "SA";
  currency: "USD" | "SAR";
  net: number;
  note?: string;
};

type DailyReport = {
  date: string;
  market: "US" | "SA";
  status: "reconciled" | "review";
  added: number;
  currency: "USD" | "SAR";
  trades: string;
  note: string;
};

const EXCHANGE_RATE = 3.7409;
const UPDATED_THROUGH = "17 يوليو 2026";
const START_DATE = "6 يوليو 2026";
const INITIAL_US_CAPITAL_SAR = 7000;

const usRows: ProfitRow[] = [
  { symbol: "DXST", name: "Decent Holding", market: "US", currency: "USD", net: 140.8, note: "دورة 710 أسهم - تقرير 17 يوليو" },
  { symbol: "JLHL", market: "US", currency: "USD", net: 164.93 },
  { symbol: "GMM", market: "US", currency: "USD", net: 152.43 },
  { symbol: "TDTH", market: "US", currency: "USD", net: 24.42 },
  { symbol: "JSPR", market: "US", currency: "USD", net: 15.24 },
  { symbol: "WRAP", market: "US", currency: "USD", net: 13.8 },
  { symbol: "QTTB", market: "US", currency: "USD", net: 12.01 },
  { symbol: "JZXN", market: "US", currency: "USD", net: 10.29 },
  { symbol: "NXTC", name: "NextCure", market: "US", currency: "USD", net: 8.17, note: "63 سهمًا - مطابقة صافي الشراء والبيع" },
  { symbol: "HAO", market: "US", currency: "USD", net: 2.68 },
  { symbol: "ETOR", market: "US", currency: "USD", net: 1.93 },
  { symbol: "PYPL", name: "PayPal", market: "US", currency: "USD", net: 1.7, note: "7 أسهم - مطابقة صافي الشراء والبيع" },
  { symbol: "FUBO", market: "US", currency: "USD", net: 0.91 },
  { symbol: "BKR", market: "US", currency: "USD", net: 0.73 },
  { symbol: "HPE", market: "US", currency: "USD", net: -0.09 },
  { symbol: "FRPT", market: "US", currency: "USD", net: -0.92 },
  { symbol: "MCHP", market: "US", currency: "USD", net: -1.17 },
  { symbol: "AMWL", market: "US", currency: "USD", net: -1.35, note: "الجزء المباع فقط" },
  { symbol: "VLO", market: "US", currency: "USD", net: -3.02 },
  { symbol: "IBKR", market: "US", currency: "USD", net: -3.48 },
  { symbol: "LVS", market: "US", currency: "USD", net: -7.07 },
  { symbol: "OXY", market: "US", currency: "USD", net: -9.62 },
];

const dailyReports: DailyReport[] = [
  { date: "17 يوليو 2026", market: "US", status: "review", added: 150.67, currency: "USD", trades: "DXST · NXTC · PYPL", note: "تمت إضافة الصفقات المطابقة فقط. بيع TNDM بانتظار كشف تكلفة الشراء." },
  { date: "16 يوليو 2026", market: "US", status: "reconciled", added: 0, currency: "USD", trades: "تقرير مرجعي", note: "استُخدم لمطابقة تكاليف PYPL وNXTC، دون تكرار النتائج السابقة." },
  { date: "16 يوليو 2026", market: "SA", status: "reconciled", added: 0, currency: "SAR", trades: "ثمار 4160", note: "النتيجة مدرجة مسبقًا ضمن السجل السعودي؛ لم تُحتسب مرتين." },
];

const saRows: ProfitRow[] = [
  { symbol: "4140", name: "صادرات", market: "SA", currency: "SAR", net: 39.2 },
  { symbol: "4144", name: "رؤوم", market: "SA", currency: "SAR", net: 9.2 },
  { symbol: "4160", name: "ثمار", market: "SA", currency: "SAR", net: 8.78, note: "الجزء المباع فقط" },
  { symbol: "1321", name: "أنابيب الشرق", market: "SA", currency: "SAR", net: 4.57 },
  { symbol: "2280", name: "المراعي", market: "SA", currency: "SAR", net: 4.94 },
  { symbol: "6050", name: "الأسماك", market: "SA", currency: "SAR", net: 2.96 },
  { symbol: "4083", name: "المتحدة الدولية", market: "SA", currency: "SAR", net: 1.55 },
  { symbol: "1010", name: "بنك الرياض", market: "SA", currency: "SAR", net: 1.38 },
  { symbol: "4230", name: "البحر الأحمر", market: "SA", currency: "SAR", net: 1.12 },
  { symbol: "2223", name: "لوبريف", market: "SA", currency: "SAR", net: 0.34 },
  { symbol: "8040", name: "متكاملة للتأمين", market: "SA", currency: "SAR", net: 0.24 },
  { symbol: "4110", name: "باتك", market: "SA", currency: "SAR", net: -0.23 },
];

const previousUsNet = 372.65;
const newVerifiedUsNet = 150.67;
const usNet = previousUsNet + newVerifiedUsNet;
const saNet = 74.05;
const combinedSar = usNet * EXCHANGE_RATE + saNet;
const combinedUsd = usNet + saNet / EXCHANGE_RATE;
const usProfitSar = usNet * EXCHANGE_RATE;
const currentUsCapitalSar = INITIAL_US_CAPITAL_SAR + usProfitSar;
const capitalReturnPct = usProfitSar / INITIAL_US_CAPITAL_SAR * 100;
const capitalMultiple = currentUsCapitalSar / INITIAL_US_CAPITAL_SAR;
const remainingToDoubleSar = INITIAL_US_CAPITAL_SAR * 2 - currentUsCapitalSar;

function formatMoney(value: number, currency: "USD" | "SAR") {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value) + (currency === "USD" ? " $" : " ر.س");
}

function ProfitTable({ title, rows }: { title: string; rows: ProfitRow[] }) {
  const winners = rows.filter((row) => row.net > 0).length;
  const losers = rows.filter((row) => row.net < 0).length;
  const orderedRows = [...rows].sort((a, b) => b.net - a.net);

  return (
    <section className="profits-panel">
      <div className="profits-section-head">
        <div>
          <span className="profits-eyebrow">تفاصيل الصفقات المغلقة</span>
          <h2>{title}</h2>
        </div>
        <div className="profits-counts">
          <span className="profit-chip positive-chip">رابحة {winners}</span>
          <span className="profit-chip negative-chip">خاسرة {losers}</span>
        </div>
      </div>

      <div className="profits-table-wrap">
        <table className="profits-table">
          <thead>
            <tr>
              <th>#</th>
              <th>السهم</th>
              <th>الشركة</th>
              <th>السوق</th>
              <th>صافي النتيجة بعد الرسوم</th>
              <th>الحالة</th>
              <th>ملاحظات</th>
            </tr>
          </thead>
          <tbody>
            {orderedRows.map((row, index) => (
              <tr key={`${row.market}-${row.symbol}`}>
                <td>{index + 1}</td>
                <td><strong>{row.symbol}</strong></td>
                <td>{row.name || "—"}</td>
                <td>{row.market === "US" ? "الأمريكي" : "السعودي"}</td>
                <td className={row.net >= 0 ? "profit-positive" : "profit-negative"}>
                  {row.net >= 0 ? "+" : ""}{formatMoney(row.net, row.currency)}
                </td>
                <td>
                  <span className={`profit-status ${row.net >= 0 ? "win" : "loss"}`}>
                    {row.net >= 0 ? "ربح محقق" : "خسارة محققة"}
                  </span>
                </td>
                <td>{row.note || "صفقة مغلقة بالكامل"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ReportsTimeline() {
  return <section className="reports-panel">
    <div className="profits-section-head">
      <div><span className="profits-eyebrow">سجل المراجعة</span><h2>التقارير الجديدة</h2></div>
      <span className="report-source-badge">3 كشوف تمت مراجعتها</span>
    </div>
    <div className="reports-grid">{dailyReports.map((report) => <article key={`${report.date}-${report.market}`}>
      <div className="report-top"><span className={`market-mark ${report.market.toLowerCase()}`}>{report.market === "US" ? "السوق الأمريكي" : "السوق السعودي"}</span><span className={`report-state ${report.status}`}>{report.status === "review" ? "إضافة جديدة" : "تمت المطابقة"}</span></div>
      <time>{report.date}</time><strong>{report.added ? `+${formatMoney(report.added, report.currency)}` : "دون إضافة مكررة"}</strong>
      <p>{report.trades}</p><small>{report.note}</small>
    </article>)}</div>
  </section>
}

export default function RealizedProfitsPage() {
  return (
    <main className="profits-page">
      <nav className="profits-nav">
        <Link href="/" className="profits-back">العودة إلى غرفة العمليات</Link>
        <div className="profits-brand">MAHER HERO <span>AI</span></div>
      </nav>

      <header className="profits-hero">
        <div>
          <span className="profits-badge">محدّث ومراجع حتى {UPDATED_THROUGH}</span>
          <h1>مركز الأداء والأرباح</h1>
          <p>صورة واضحة للأرباح المحققة، جودة النتائج، وآخر التقارير التي تمت مطابقتها بعد الرسوم، دون خلطها بالمراكز المفتوحة.</p>
        </div>
        <div className="profits-total-card">
          <span>الإجمالي الموحد التقريبي</span>
          <strong>{formatMoney(combinedSar, "SAR")}</strong>
          <small>يعادل تقريبًا {formatMoney(combinedUsd, "USD")}</small>
        </div>
      </header>

      <section className="profits-summary">
        <article>
          <span>السوق الأمريكي</span>
          <strong>{formatMoney(usNet, "USD")}</strong>
          <small>{usRows.length} دورة تداول مغلقة</small>
        </article>
        <article>
          <span>السوق السعودي</span>
          <strong>{formatMoney(saNet, "SAR")}</strong>
          <small>{saRows.length} نتيجة مغلقة</small>
        </article>
        <article>
          <span>سعر الصرف المرجعي</span>
          <strong>{EXCHANGE_RATE.toFixed(4)}</strong>
          <small>ريال لكل دولار</small>
        </article>
        <article>
          <span>الإضافة الجديدة المؤكدة</span>
          <strong className="profit-positive">+{formatMoney(newVerifiedUsNet, "USD")}</strong>
          <small>3 دورات مكتملة من تقرير 17 يوليو</small>
        </article>
      </section>

      <section className="performance-strip">
        <div><span>الرصيد الأمريكي السابق</span><strong>{formatMoney(previousUsNet, "USD")}</strong></div>
        <i>+</i><div><span>التقارير الجديدة</span><strong>{formatMoney(newVerifiedUsNet, "USD")}</strong></div>
        <i>=</i><div className="performance-result"><span>الإجمالي الأمريكي الحالي</span><strong>{formatMoney(usNet, "USD")}</strong></div>
      </section>

      <section className="capital-growth">
        <div className="capital-growth-head"><div><span className="profits-eyebrow">منذ بداية التداول في {START_DATE}</span><h2>نمو رأس المال الأمريكي</h2></div><span className="growth-badge">+{capitalReturnPct.toFixed(2)}%</span></div>
        <div className="capital-equation"><article><span>رأس المال المودع</span><strong>{formatMoney(INITIAL_US_CAPITAL_SAR, "SAR")}</strong><small>3 إيداعات مؤكدة</small></article><i>+</i><article><span>الأرباح الأمريكية المحققة</span><strong className="profit-positive">{formatMoney(usProfitSar, "SAR")}</strong><small>{formatMoney(usNet, "USD")}</small></article><i>=</i><article className="current-capital"><span>رأس المال النظري الحالي</span><strong>{formatMoney(currentUsCapitalSar, "SAR")}</strong><small>{formatMoney(currentUsCapitalSar / EXCHANGE_RATE, "USD")}</small></article></div>
        <div className="double-progress"><div><span>التقدم نحو مضاعفة رأس المال إلى 14,000 ر.س</span><strong>{capitalReturnPct.toFixed(2)}%</strong></div><b><i style={{width:`${Math.min(100,capitalReturnPct)}%`}} /></b><small>المتبقي لتحقيق الضعف: {formatMoney(remainingToDoubleSar, "SAR")} · مضاعف رأس المال الحالي: {capitalMultiple.toFixed(2)}×</small></div>
        <div className="deposits-row"><span>6 يوليو: 1,500 ر.س</span><span>7 يوليو: 4,500 ر.س</span><span>13 يوليو: 1,000 ر.س</span></div>
      </section>

      <ReportsTimeline />

      <ProfitTable title="السوق الأمريكي" rows={usRows} />
      <ProfitTable title="السوق السعودي" rows={saRows} />

      <section className="profits-note">
        <strong>ملاحظة محاسبية</strong>
        <p>هذه الصفحة تعرض الأرقام المطابقة من كشوف العمليات حتى {UPDATED_THROUGH}. الصفقات الجزئية مثل AMWL وثمار محسوبة على الكمية المباعة فقط. بيع TNDM بتاريخ 17 يوليو غير مضاف للربح إلى أن يتوفر كشف تكلفة الشراء، منعًا لإظهار نتيجة تقديرية كأنها مؤكدة.</p>
      </section>

      <footer className="profits-footer">ماهر هيرو — سجل الأرباح المحققة بعد الرسوم</footer>
    </main>
  );
}
