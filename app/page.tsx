"use client";

import { useMemo, useState } from "react";

type StockInput = {
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
};

type Pick = StockInput & {
  score: number;
  classification: string;
  reasons: string[];
};

const demoStocks: StockInput[] = [
  { symbol: "HERO", name: "فرصة تجريبية للعرض", market: "US", price: 8.4, changePct: 3.2, volumeRatio: 2.7, rsi: 61, macdSignal: "bullish", trend: "up", breakout: "early", resistanceDistancePct: 6.2, stopDistancePct: 2.2 },
  { symbol: "MHR", name: "إعادة اختبار تجريبية", market: "US", price: 15.2, changePct: 2.1, volumeRatio: 2.1, rsi: 57, macdSignal: "bullish", trend: "up", breakout: "retest", resistanceDistancePct: 5.1, stopDistancePct: 2.5 },
  { symbol: "AIH", name: "حركة تجريبية نشطة", market: "US", price: 4.75, changePct: 4.5, volumeRatio: 1.8, rsi: 64, macdSignal: "bullish", trend: "up", breakout: "early", resistanceDistancePct: 4.4, stopDistancePct: 2.9 },
];

export default function Home() {
  const [market, setMarket] = useState<"US" | "SA">("US");
  const [capital, setCapital] = useState(5000);
  const [riskPct, setRiskPct] = useState(1);
  const [loading, setLoading] = useState(false);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [narrative, setNarrative] = useState("");
  const [error, setError] = useState("");
  const [lastScan, setLastScan] = useState("لم يبدأ الفحص بعد");
  const [dataMode, setDataMode] = useState<"demo" | "live">("demo");
  const [scanned, setScanned] = useState(0);

  const currency = market === "US" ? "$" : "ر.س";
  const tradableCapital = useMemo(() => capital * 0.9, [capital]);
  const marketLabel = market === "US" ? "السوق الأمريكي" : "السوق السعودي";

  async function analyze() {
    setLoading(true);
    setError("");
    setNarrative("");
    setPicks([]);
    try {
      let stocks: StockInput[] = demoStocks.map((stock) => ({ ...stock, market }));
      let currentMode: "demo" | "live" = "demo";
      let scannedCount = stocks.length;

      if (market === "US") {
        const marketResponse = await fetch("/api/market/scan", { cache: "no-store" });
        const marketData = await marketResponse.json();
        if (marketResponse.ok && marketData.mode === "live" && marketData.stocks?.length) {
          stocks = marketData.stocks;
          currentMode = "live";
          scannedCount = marketData.scanned ?? stocks.length;
        } else if (marketData.error) {
          setError(`${marketData.error} تم تشغيل العرض التجريبي مؤقتًا.`);
        }
      } else {
        setError("ربط السوق السعودي قيد التجهيز؛ تم تشغيل العرض التجريبي مؤقتًا.");
      }

      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ market, capital, riskPct, stocks }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "تعذر التحليل");

      setPicks(data.picks || []);
      setNarrative(data.narrative || data.message || "");
      setDataMode(currentMode);
      setScanned(scannedCount);
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
        <div className={`live ${dataMode === "live" ? "is-live" : ""}`}><i /> {dataMode === "live" ? "بيانات سوق حقيقية" : "وضع تجريبي"}</div>
      </nav>

      <header className="hero">
        <div>
          <div className="badge">Maher Hero AI — v1.1</div>
          <h1>غرفة عمليات الأسهم الذكية</h1>
          <p>فلترة السوق، تقييم الفرص من 100، إدارة رأس المال، وتحديد الدخول والوقف والأهداف قبل التنفيذ.</p>
        </div>
        <aside className="market-box">
          <span>حالة النظام</span>
          <strong>{loading ? "جارٍ الفحص" : "جاهز للفحص"}</strong>
          <small>آخر فحص: {lastScan}</small>
        </aside>
      </header>

      <section className="panel controls">
        <label>السوق
          <select value={market} onChange={(e) => setMarket(e.target.value as "US" | "SA")}>
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

      {loading && <section className="scanner panel"><div className="scan-head"><strong>جارٍ تحليل {marketLabel}</strong><span>MACD • RSI • الحجم • الاختراق</span></div><div className="progress"><b /></div><p>يتم الآن استبعاد الأسهم المتأخرة وضعيفة السيولة...</p></section>}

      <section className="summary">
        <article><span>رأس المال</span><strong>{capital.toLocaleString()} {currency}</strong></article>
        <article><span>المتاح للتداول 90%</span><strong>{tradableCapital.toLocaleString()} {currency}</strong></article>
        <article><span>حد المخاطرة للصفقة</span><strong>{(capital * riskPct / 100).toLocaleString()} {currency}</strong></article>
        <article><span>الأسهم المفحوصة</span><strong>{scanned || "—"}</strong></article>
      </section>

      {error && <p className="error">{error}</p>}
      {narrative && <section className="panel narrative"><div className="section-title"><span>قراءة ماهر هيرو</span><small>{dataMode === "live" ? "تحليل بيانات السوق الحقيقية" : "تحليل العرض التجريبي"}</small></div><p>{narrative}</p></section>}

      <section className="section-title opportunities"><span>أفضل الفرص الحالية</span><small>{picks.length ? `تم اختيار ${picks.length} أسهم` : "اضغط الفحص لإظهار النتائج"}</small></section>

      <section className="cards">
        {picks.map((pick, index) => {
          const allocation = tradableCapital * [0.4, 0.35, 0.25][index];
          const stop = pick.price * (1 - pick.stopDistancePct / 100);
          const target1 = pick.price * (1 + Math.max(0.025, pick.stopDistancePct * 1.25 / 100));
          const target2 = pick.price * (1 + Math.max(0.045, pick.stopDistancePct * 2 / 100));
          const riskPerShare = Math.max(0.01, pick.price - stop);
          const maxRisk = capital * riskPct / 100;
          const quantity = Math.max(0, Math.min(Math.floor(allocation / pick.price), Math.floor(maxRisk / riskPerShare)));
          const used = quantity * pick.price;
          return (
            <article className="stock-card" key={pick.symbol}>
              <div className="card-top"><div className="rank">الفرصة #{index + 1}</div><div className="score">{pick.score}<small>/100</small></div></div>
              <h2>{pick.symbol}</h2>
              <p>{pick.name}</p>
              <div className="status">{pick.classification}</div>
              <div className="trade-grid">
                <div><span>السعر/الدخول المشروط</span><strong>{pick.price.toFixed(2)} {currency}</strong></div>
                <div><span>وقف الخسارة</span><strong>{stop.toFixed(2)} {currency}</strong></div>
                <div><span>الهدف الأول</span><strong>{target1.toFixed(2)} {currency}</strong></div>
                <div><span>الهدف الثاني</span><strong>{target2.toFixed(2)} {currency}</strong></div>
                <div><span>الكمية المقترحة</span><strong>{quantity} سهم</strong></div>
                <div><span>قيمة الصفقة</span><strong>{used.toFixed(0)} {currency}</strong></div>
              </div>
              <ul>{pick.reasons.slice(0, 4).map((reason) => <li key={reason}>{reason}</li>)}</ul>
              <button className="ghost">لماذا اخترت هذا السهم؟</button>
            </article>
          );
        })}
      </section>

      <section className="panel watchroom">
        <div className="section-title"><span>غرفة المتابعة</span><small>المرحلة القادمة</small></div>
        <div className="watch-grid">
          <article><b>🔔 تنبيهات الفرص</b><p>إشعار عند تجاوز السهم درجة 90/100.</p></article>
          <article><b>📈 متابعة الصفقة</b><p>تحديث الربح والهدف ووقف الخسارة.</p></article>
          <article><b>🧠 مساعد ماهر هيرو</b><p>شرح سبب الدخول أو الانتظار باللغة العربية.</p></article>
        </div>
      </section>

      <footer>{dataMode === "live" ? "الأسعار واردة من مزود السوق، لكن النتائج تحليلية ولا تنفذ أوامر شراء وبيع." : "الوضع التجريبي مفعّل. أضف مفاتيح مزود السوق إلى Vercel لتفعيل الأسعار الحقيقية."}</footer>
    </main>
  );
}
