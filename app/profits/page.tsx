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

const EXCHANGE_RATE = 3.7409;
const UPDATED_THROUGH = "15 يوليو 2026";

const usRows: ProfitRow[] = [
  { symbol: "JLHL", market: "US", currency: "USD", net: 164.93 },
  { symbol: "GMM", market: "US", currency: "USD", net: 152.43 },
  { symbol: "TDTH", market: "US", currency: "USD", net: 24.42 },
  { symbol: "JSPR", market: "US", currency: "USD", net: 15.24 },
  { symbol: "WRAP", market: "US", currency: "USD", net: 13.8 },
  { symbol: "QTTB", market: "US", currency: "USD", net: 12.01 },
  { symbol: "JZXN", market: "US", currency: "USD", net: 10.29 },
  { symbol: "HAO", market: "US", currency: "USD", net: 2.68 },
  { symbol: "ETOR", market: "US", currency: "USD", net: 1.93 },
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

const usNet = 372.65;
const saNet = 74.05;
const combinedSar = 1468.1;
const combinedUsd = 392.45;

function formatMoney(value: number, currency: "USD" | "SAR") {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value) + (currency === "USD" ? " $" : " ر.س");
}

function ProfitTable({ title, rows }: { title: string; rows: ProfitRow[] }) {
  const winners = rows.filter((row) => row.net > 0).length;
  const losers = rows.filter((row) => row.net < 0).length;

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
            {rows.map((row, index) => (
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

export default function RealizedProfitsPage() {
  return (
    <main className="profits-page">
      <nav className="profits-nav">
        <Link href="/" className="profits-back">العودة إلى غرفة العمليات</Link>
        <div className="profits-brand">MAHER HERO <span>AI</span></div>
      </nav>

      <header className="profits-hero">
        <div>
          <span className="profits-badge">سجل رسمي — حتى {UPDATED_THROUGH}</span>
          <h1>الأرباح المحققة</h1>
          <p>النتائج الفعلية للصفقات التي تم إغلاقها وبيعها، بعد احتساب الرسوم والعمولات، دون إدخال أرباح أو خسائر المراكز المفتوحة.</p>
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
          <span>طريقة الحساب</span>
          <strong>صافي بعد الرسوم</strong>
          <small>الصفقات المغلقة فقط</small>
        </article>
      </section>

      <ProfitTable title="السوق الأمريكي" rows={usRows} />
      <ProfitTable title="السوق السعودي" rows={saRows} />

      <section className="profits-note">
        <strong>ملاحظة محاسبية</strong>
        <p>هذه الصفحة تعرض الأرقام المعتمدة من كشوف العمليات حتى {UPDATED_THROUGH}. الصفقات الجزئية مثل AMWL وثمار محسوبة على الكمية المباعة فقط. لا تُستبدل هذه الأرقام إلا بعد إضافة كشف أحدث ومراجعته.</p>
      </section>

      <footer className="profits-footer">ماهر هيرو — سجل الأرباح المحققة بعد الرسوم</footer>
    </main>
  );
}
