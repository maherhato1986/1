"use client";

import { useMemo, useState } from "react";

type Pick = {
  symbol: string;
  name: string;
  market: "US" | "SA";
  price: number;
  changePct: number;
  volumeRatio: number;
  rsi: number;
  macdSignal: "bullish" | "bearish" | "neutral";
  trend: "up" | "down" | "sideways";
  breakout: "early" | "retest" | "late" | "none";
  resistanceDistancePct: number;
  stopDistancePct: number;
  score: number;
  classification: string;
  reasons: string[];
  warnings?: string[];
  breakdown?: Record<string, number>;
};

async function readApiResponse(response: Response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const text = await response.text();
    throw new Error(`تعذر الوصول إلى خدمة الفحص (${response.status}). أعد المحاولة بعد اكتمال نشر Vercel. ${text.slice(0, 80)}`);
  }
  return response.json();
}

function scoreTone(score: number) {
  if (score >= 95) return "strong";
  if (score >= 80) return "watch";
  return "avoid";
}

function decisionLabel(stock: Pick) {
  if (stock.score >= 95) return "شراء مشروط";
  if (stock.breakout === "retest") return "انتظار إعادة الاختبار";
  if (stock.breakout === "late") return "متأخر — لا تطارد";
  return "مراقبة";
}

function indicatorLabel(value: Pick["macdSignal"]) {
  if (value === "bullish") return "إيجابي";
  if (value === "bearish") return "سلبي";
  return "محايد";
}

export default function Home() {
  const [market, setMarket] = useState<"US" | "SA">("US");
  const [capital, setCapital] = useState(5000);
  const [riskPct, setRiskPct] = useState(1);
  const [loading, setLoading] = useState(false);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [watchlist, setWatchlist] = useState<Pick[]>([]);
  const [narrative, setNarrative] = useState("");
  const [warning, setWarning] = useState("");
  const [error, setError] = useState("");
  const [lastScan, setLastScan] = useState("لم يبدأ الفحص بعد");
  const [scanned, setScanned] = useState(0);
  const [provider, setProvider] = useState("");

  const currency = market === "US" ? "$" : "ر.س";
  const tradableCapital = useMemo(() => capital * 0.9, [capital]);
  const marketLabel = market === "US" ? "السوق الأمريكي" : "السوق السعودي";
  const confirmedCount = picks.length;
  const bestScore = Math.max(0, ...picks.map((item) => item.score), ...watchlist.map((item) => item.score));
  const overallDecision = confirmedCount ? "توجد فرصة شراء مشروط" : watchlist.length ? "السوق للمراقبة" : "لا توجد فرصة مناسبة";

  async function analyze() {
    setLoading(true);
    setError("");
    setWarning("");
    setNarrative("");
    setPicks([]);
    setWatchlist([]);
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ market, capital, riskPct }),
      });
      const data = await readApiResponse(response);
      if (!response.ok) throw new Error(data.error || "تعذر التحليل");
      setPicks(data.picks || []);
      setWatchlist(data.watchlist || []);
      setNarrative(data.narrative || data.message || "");
      setWarning(data.warning || "");
      setScanned(data.scanned || 0);
      setProvider(data.provider || "");
      setLastScan(new Date().toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "حدث خطأ غير متوقع");
    } finally {
      setLoading(false);
    }
  }

  function StockCard({ pick, index, confirmed = false }: { pick: Pick; index: number; confirmed?: boolean }) {
    const allocation = tradableCapital * ([0.4, 0.35, 0.25][index] ?? 0.25);
    const stop = pick.price * (1 - pick.stopDistancePct / 100);
    const riskPerShare = Math.max(0.01, pick.price - stop);
    const maxRisk = capital * riskPct / 100;
    const quantity = Math.max(0, Math.min(Math.floor(allocation / pick.price), Math.floor(maxRisk / riskPerShare)));
    const used = quantity * pick.price;
    const oneR = pick.price + riskPerShare;
    const technicalTarget = pick.price * (1 + Math.max(0, pick.resistanceDistancePct) / 100);
    const target1 = Math.min(technicalTarget, oneR);
    const target2 = Math.min(technicalTarget, pick.price + riskPerShare * 2);
    const tone = scoreTone(pick.score);

    return (
      <article className={`stock-card ${tone}`}>
        <div className="card-top">
          <div>
            <span className="rank">#{index + 1} {confirmed ? "فرصة مؤكدة" : "مرشح مراقبة"}</span>
            <h2>{pick.symbol}</h2>
            <p className="stock-name">{pick.name}</p>
          </div>
          <div className={`score-badge ${tone}`}><strong>{pick.score}</strong><small>/100</small></div>
        </div>

        <div className={`decision-pill ${tone}`}>{decisionLabel(pick)}</div>
        <div className="score-track"><span style={{ width: `${Math.min(100, pick.score)}%` }} /></div>

        <div className="indicator-grid">
          <div><span>الاتجاه</span><strong>{pick.trend === "up" ? "صاعد" : pick.trend === "down" ? "هابط" : "عرضي"}</strong></div>
          <div><span>MACD</span><strong>{indicatorLabel(pick.macdSignal)}</strong></div>
          <div><span>RSI</span><strong>{pick.rsi.toFixed(1)}</strong></div>
          <div><span>RVOL</span><strong>{pick.volumeRatio.toFixed(2)}</strong></div>
        </div>

        {confirmed && <div className="trade-grid">
          <div><span>الدخول المشروط</span><strong>{pick.price.toFixed(2)} {currency}</strong></div>
          <div><span>وقف الخسارة</span><strong>{stop.toFixed(2)} {currency}</strong></div>
          <div><span>الهدف الأول</span><strong>{target1.toFixed(2)} {currency}</strong></div>
          <div><span>الهدف الثاني</span><strong>{target2.toFixed(2)} {currency}</strong></div>
          <div><span>الكمية المقترحة</span><strong>{quantity} سهم</strong></div>
          <div><span>قيمة الصفقة</span><strong>{used.toFixed(0)} {currency}</strong></div>
        </div>}

        <details className="analysis-details">
          <summary>عرض التحليل الكامل</summary>
          <div className="details-content">
            <p><b>المقاومة التالية:</b> {pick.resistanceDistancePct.toFixed(2)}% — <b>التغير:</b> {pick.changePct.toFixed(2)}%</p>
            {!!pick.reasons?.length && <ul>{pick.reasons.slice(0, 6).map((reason) => <li key={reason}>{reason}</li>)}</ul>}
            {!!pick.warnings?.length && <div className="warnings"><b>تحذيرات:</b><ul>{pick.warnings.map((item) => <li key={item}>{item}</li>)}</ul></div>}
          </div>
        </details>
      </article>
    );
  }

  return (
    <main>
      <nav className="topbar">
        <div className="brand">MAHER HERO <span>AI</span></div>
        <div className={`live ${provider ? "is-live" : ""}`}><i /> {provider ? `بيانات حقيقية — ${provider}` : "جاهز للفحص"}</div>
      </nav>

      <header className="hero">
        <div>
          <div className="badge">Maher Hero AI — v2.2</div>
          <h1>غرفة عمليات الأسهم الذكية</h1>
          <p>فلترة السوق، تقييم الفرص، وإدارة المخاطرة في لوحة واحدة واضحة قبل التنفيذ.</p>
        </div>
        <aside className="market-box">
          <span>حالة النظام</span>
          <strong>{loading ? "جارٍ الفحص" : "جاهز للفحص"}</strong>
          <small>آخر فحص: {lastScan}</small>
        </aside>
      </header>

      <section className="panel controls">
        <label>السوق<select value={market} onChange={(e) => setMarket(e.target.value as "US" | "SA")}><option value="US">السوق الأمريكي</option><option value="SA">السوق السعودي</option></select></label>
        <label>رأس المال<input type="number" min="100" value={capital} onChange={(e) => setCapital(Number(e.target.value))} /></label>
        <label>المخاطرة لكل صفقة %<input type="number" min="0.1" max="3" step="0.1" value={riskPct} onChange={(e) => setRiskPct(Number(e.target.value))} /></label>
        <button onClick={analyze} disabled={loading}>{loading ? "جارٍ فحص السوق..." : "ابدأ فحص ماهر هيرو"}</button>
      </section>

      {loading && <section className="scanner panel"><div className="scan-head"><strong>جارٍ تحليل {marketLabel}</strong><span>MACD • RSI • RVOL • الاختراق • AI</span></div><div className="progress"><b /></div><div className="scan-steps"><span>بيانات السوق</span><span>المؤشرات</span><span>إدارة المخاطرة</span><span>قراءة AI</span></div></section>}

      <section className="summary">
        <article><span>رأس المال</span><strong>{capital.toLocaleString()} {currency}</strong></article>
        <article><span>المتاح للتداول</span><strong>{tradableCapital.toLocaleString()} {currency}</strong></article>
        <article><span>حد المخاطرة</span><strong>{(capital * riskPct / 100).toLocaleString()} {currency}</strong></article>
        <article><span>الأسهم المفحوصة</span><strong>{scanned || "—"}</strong></article>
      </section>

      {(provider || scanned > 0) && <section className="decision-board panel">
        <div className="decision-main">
          <span>قرار ماهر هيرو</span>
          <strong className={confirmedCount ? "positive" : "caution"}>{overallDecision}</strong>
          <small>{confirmedCount ? "التنفيذ مشروط بثبات الحجم والسعر" : "لا تدخل قبل تحقق شروط الاختراق"}</small>
        </div>
        <div className="decision-stats">
          <div><span>أعلى تقييم</span><strong>{bestScore || "—"}</strong></div>
          <div><span>فرص 95+</span><strong>{confirmedCount}</strong></div>
          <div><span>مرشحو المراقبة</span><strong>{watchlist.length}</strong></div>
          <div><span>المصدر</span><strong>{provider || "—"}</strong></div>
        </div>
      </section>}

      {error && <p className="error">{error}</p>}
      {warning && <p className="warning-box">تنبيه البيانات: {warning}</p>}

      {narrative && <section className="panel ai-summary">
        <div className="section-title"><div><small>تحليل الذكاء الاصطناعي</small><span>قراءة ماهر هيرو</span></div><em>AI</em></div>
        <details open>
          <summary>عرض الملخص الذكي</summary>
          <p>{narrative}</p>
        </details>
      </section>}

      {!!picks.length && <>
        <section className="section-title opportunities"><div><small>تجاوزت 95/100</small><span>الفرص المؤكدة</span></div><b>{picks.length}</b></section>
        <section className="cards">{picks.map((pick, index) => <StockCard key={pick.symbol} pick={pick} index={index} confirmed />)}</section>
      </>}

      {!!watchlist.length && <>
        <section className="section-title opportunities"><div><small>تحتاج تأكيدًا إضافيًا</small><span>أفضل فرص المراقبة</span></div><b>{watchlist.length}</b></section>
        <section className="cards watch-cards">{watchlist.slice(0, 3).map((pick, index) => <StockCard key={pick.symbol} pick={pick} index={index} />)}</section>
      </>}

      {!loading && scanned > 0 && !picks.length && !watchlist.length && <section className="empty-state panel"><strong>لا توجد فرصة مناسبة حاليًا</strong><p>الانتظار قرار تداول. أعد الفحص عند تغير الحجم أو ظهور اختراق جديد.</p></section>}

      <footer>النتائج تحليلية وليست ضمانًا للربح. تحقق من السعر والسيولة في منصة التداول قبل التنفيذ.</footer>
    </main>
  );
}
