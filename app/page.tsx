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

  return (
    <main>
      <nav className="topbar">
        <div className="brand">MAHER HERO <span>AI</span></div>
        <div className={`live ${provider ? "is-live" : ""}`}><i /> {provider ? `بيانات حقيقية — ${provider}` : "جاهز للفحص"}</div>
      </nav>

      <header className="hero">
        <div>
          <div className="badge">Maher Hero AI — v2.1</div>
          <h1>غرفة عمليات الأسهم الذكية</h1>
          <p>فلترة السوق، تقييم الفرص، إدارة رأس المال، وتحديد الدخول والوقف والأهداف قبل التنفيذ.</p>
        </div>
        <aside className="market-box">
          <span>حالة النظام</span>
          <strong>{loading ? "جارٍ الفحص" : "جاهز للفحص"}</strong>
          <small>آخر فحص: {lastScan}</small>
        </aside>
      </header>

      <section className="panel controls">
        <label>السوق
          <select value={market} onChange={(e) => setMarket(e.target.value as "US" | "SA") }>
            <option value="US">السوق الأمريكي</option>
            <option value="SA">السوق السعودي</option>
          </select>
        </label>
        <label>رأس المال
          <input type="number" min="100" value={capital} onChange={(e) => setCapital(Number(e.target.value))} />
        </label>
        <label>المخاطرة لكل صفقة %
          <input type="number" min="0.1" max="3" step="0.1" value={riskPct} onChange={(e) => setRiskPct(Number(e.target.value))} />
        </label>
        <button onClick={analyze} disabled={loading}>{loading ? "جارٍ فحص السوق..." : "ابدأ فحص ماهر هيرو"}</button>
      </section>

      {loading && <section className="scanner panel"><div className="scan-head"><strong>جارٍ تحليل {marketLabel}</strong><span>MACD • RSI • RVOL • الاختراق • المخاطرة</span></div><div className="progress"><b /></div><p>يتم استبعاد الشموع غير المكتملة والأسهم المتأخرة وضعيفة السيولة...</p></section>}

      <section className="summary">
        <article><span>رأس المال</span><strong>{capital.toLocaleString()} {currency}</strong></article>
        <article><span>المتاح للتداول 90%</span><strong>{tradableCapital.toLocaleString()} {currency}</strong></article>
        <article><span>حد المخاطرة للصفقة</span><strong>{(capital * riskPct / 100).toLocaleString()} {currency}</strong></article>
        <article><span>الأسهم المفحوصة</span><strong>{scanned || "—"}</strong></article>
      </section>

      {error && <p className="error">{error}</p>}
      {warning && <p className="error">تنبيه البيانات: {warning}</p>}
      {narrative && <section className="panel narrative"><div className="section-title"><span>قراءة ماهر هيرو</span><small>تحليل خادمي موثوق</small></div><p>{narrative}</p></section>}

      <section className="section-title opportunities"><span>أفضل الفرص الحالية</span><small>{picks.length ? `تم اختيار ${picks.length} أسهم` : "لا توجد فرصة مؤكدة حتى الآن"}</small></section>
      <section className="cards">
        {picks.map((pick, index) => {
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
          return (
            <article className="stock-card" key={pick.symbol}>
              <div className="card-top"><div className="rank">الفرصة #{index + 1}</div><div className="score">{pick.score}<small>/100</small></div></div>
              <h2>{pick.symbol}</h2>
              <p>{pick.name}</p>
              <div className="status">{pick.classification}</div>
              <div className="trade-grid">
                <div><span>الدخول المشروط</span><strong>{pick.price.toFixed(2)} {currency}</strong></div>
                <div><span>وقف الخسارة</span><strong>{stop.toFixed(2)} {currency}</strong></div>
                <div><span>الهدف الأول</span><strong>{target1.toFixed(2)} {currency}</strong></div>
                <div><span>الهدف الثاني</span><strong>{target2.toFixed(2)} {currency}</strong></div>
                <div><span>الكمية المقترحة</span><strong>{quantity} سهم</strong></div>
                <div><span>قيمة الصفقة</span><strong>{used.toFixed(0)} {currency}</strong></div>
              </div>
              <ul>{pick.reasons.slice(0, 5).map((reason) => <li key={reason}>{reason}</li>)}</ul>
              <details>
                <summary className="ghost">لماذا اخترت هذا السهم؟</summary>
                <p>RSI: {pick.rsi.toFixed(1)} — RVOL: {pick.volumeRatio.toFixed(2)} — المسافة للمقاومة التالية: {pick.resistanceDistancePct.toFixed(2)}%</p>
                {pick.breakdown && <p>{Object.entries(pick.breakdown).map(([key, value]) => `${key}: ${value}`).join(" • ")}</p>}
                {!!pick.warnings?.length && <ul>{pick.warnings.map((item) => <li key={item}>{item}</li>)}</ul>}
              </details>
            </article>
          );
        })}
      </section>

      {!!watchlist.length && <section className="panel watchroom">
        <div className="section-title"><span>قائمة المراقبة</span><small>جيدة لكن لم تصل إلى 95/100</small></div>
        <div className="watch-grid">{watchlist.map((stock) => <article key={stock.symbol}><b>{stock.symbol} — {stock.score}/100</b><p>{stock.classification}</p></article>)}</div>
      </section>}

      <footer>النتائج تحليلية وليست ضمانًا للربح. تحقق من السعر والسيولة في منصة التداول قبل التنفيذ.</footer>
    </main>
  );
}
