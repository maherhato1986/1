"use client";

import { useMemo, useState } from "react";

type Pick = {
  symbol: string;
  name: string;
  price: number;
  score: number;
  classification: string;
  reasons: string[];
  stopDistancePct: number;
};

const mockStocks = [
  { symbol: "HERO", name: "فرصة تجريبية 1", market: "US", price: 8.4, changePct: 3.2, volumeRatio: 2.7, rsi: 61, macdSignal: "bullish", trend: "up", breakout: "early", resistanceDistancePct: 6.2, stopDistancePct: 2.2 },
  { symbol: "MHR", name: "فرصة تجريبية 2", market: "US", price: 15.2, changePct: 2.1, volumeRatio: 2.1, rsi: 57, macdSignal: "bullish", trend: "up", breakout: "retest", resistanceDistancePct: 5.1, stopDistancePct: 2.5 },
  { symbol: "AIH", name: "فرصة تجريبية 3", market: "US", price: 4.75, changePct: 4.5, volumeRatio: 1.8, rsi: 64, macdSignal: "bullish", trend: "up", breakout: "early", resistanceDistancePct: 4.4, stopDistancePct: 2.9 },
  { symbol: "LATE", name: "حركة متأخرة", market: "US", price: 2.9, changePct: 18, volumeRatio: 4.2, rsi: 82, macdSignal: "bullish", trend: "up", breakout: "late", resistanceDistancePct: 1, stopDistancePct: 7 },
] as const;

export default function Home() {
  const [market, setMarket] = useState<"US" | "SA">("US");
  const [capital, setCapital] = useState(5000);
  const [riskPct, setRiskPct] = useState(1);
  const [loading, setLoading] = useState(false);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [narrative, setNarrative] = useState("");
  const [error, setError] = useState("");

  const currency = market === "US" ? "$" : "ر.س";
  const tradableCapital = useMemo(() => capital * 0.9, [capital]);

  async function analyze() {
    setLoading(true);
    setError("");
    setNarrative("");
    try {
      const stocks = mockStocks.map((stock) => ({ ...stock, market }));
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ market, capital, riskPct, stocks }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "تعذر التحليل");
      setPicks(data.picks || []);
      setNarrative(data.narrative || data.message || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "حدث خطأ غير متوقع");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <header className="hero">
        <div className="badge">Maher Hero AI Scanner — MVP</div>
        <h1>استراتيجية ماهر هيرو</h1>
        <p>فلترة السوق، تقييم الفرص من 100، ثم إدارة رأس المال وخطة الدخول المشروط.</p>
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
        <button onClick={analyze} disabled={loading}>{loading ? "جارٍ التحليل..." : "افحص السوق التجريبي"}</button>
      </section>

      <section className="summary">
        <article><span>رأس المال</span><strong>{capital.toLocaleString()} {currency}</strong></article>
        <article><span>المتاح للتداول 90%</span><strong>{tradableCapital.toLocaleString()} {currency}</strong></article>
        <article><span>حد المخاطرة</span><strong>{(capital * riskPct / 100).toLocaleString()} {currency}</strong></article>
      </section>

      {error && <p className="error">{error}</p>}
      {narrative && <section className="panel narrative"><h2>قراءة ماهر هيرو</h2><p>{narrative}</p></section>}

      <section className="cards">
        {picks.map((pick, index) => {
          const allocation = tradableCapital * [0.4, 0.35, 0.25][index];
          const stop = pick.price * (1 - pick.stopDistancePct / 100);
          const riskPerShare = pick.price - stop;
          const maxRisk = capital * riskPct / 100;
          const quantity = Math.max(0, Math.min(Math.floor(allocation / pick.price), Math.floor(maxRisk / riskPerShare)));
          return (
            <article className="stock-card" key={pick.symbol}>
              <div className="rank">#{index + 1}</div>
              <div className="score">{pick.score}<small>/100</small></div>
              <h2>{pick.symbol}</h2>
              <p>{pick.name}</p>
              <div className="status">{pick.classification}</div>
              <dl>
                <div><dt>السعر التجريبي</dt><dd>{pick.price.toFixed(2)} {currency}</dd></div>
                <div><dt>التخصيص الأقصى</dt><dd>{allocation.toFixed(0)} {currency}</dd></div>
                <div><dt>الكمية المقترحة</dt><dd>{quantity} سهم</dd></div>
                <div><dt>وقف فني تقديري</dt><dd>{stop.toFixed(2)} {currency}</dd></div>
              </dl>
              <ul>{pick.reasons.slice(0, 4).map((reason) => <li key={reason}>{reason}</li>)}</ul>
            </article>
          );
        })}
      </section>

      <footer>النسخة الحالية تعليمية وتجريبية ولا تستخدم أسعارًا حقيقية أو تنفذ أوامر شراء وبيع.</footer>
    </main>
  );
}
