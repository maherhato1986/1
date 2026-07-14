"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Pick = {
  symbol: string;
  name: string;
  market: "US";
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
};

type RadarPick = Pick & { detectedAt: string; updatedAt: string };

type ClockData = { isOpen: boolean; nextOpen?: string; nextClose?: string; error?: string };

const AUTO_SCAN_MS = 10 * 60 * 1000;
const CLOCK_REFRESH_MS = 60 * 1000;

async function readApiResponse(response: Response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const text = await response.text();
    throw new Error(`تعذر الوصول إلى خدمة الفحص (${response.status}). ${text.slice(0, 80)}`);
  }
  return response.json();
}

function scoreTone(score: number) {
  if (score >= 90) return "strong";
  if (score >= 80) return "watch";
  return "avoid";
}

function indicatorLabel(value: Pick["macdSignal"]) {
  if (value === "bullish") return "إيجابي";
  if (value === "bearish") return "سلبي";
  return "محايد";
}

function mergeRadar(previous: RadarPick[], incoming: Pick[]) {
  const now = new Date().toISOString();
  const previousMap = new Map(previous.map((item) => [item.symbol, item]));
  return incoming.map((item) => ({
    ...item,
    detectedAt: previousMap.get(item.symbol)?.detectedAt || now,
    updatedAt: now,
  }));
}

export default function Home() {
  const [capital, setCapital] = useState(5000);
  const [riskPct, setRiskPct] = useState(1);
  const [loading, setLoading] = useState(false);
  const [radar, setRadar] = useState<RadarPick[]>([]);
  const [watchlist, setWatchlist] = useState<Pick[]>([]);
  const [narrative, setNarrative] = useState("");
  const [warning, setWarning] = useState("");
  const [error, setError] = useState("");
  const [lastScan, setLastScan] = useState("لم يبدأ الفحص بعد");
  const [nextScanAt, setNextScanAt] = useState<Date | null>(null);
  const [scanned, setScanned] = useState(0);
  const [provider, setProvider] = useState("");
  const [marketOpen, setMarketOpen] = useState(false);
  const [clockReady, setClockReady] = useState(false);
  const [autoEnabled, setAutoEnabled] = useState(true);
  const scanningRef = useRef(false);

  const tradableCapital = useMemo(() => capital * 0.9, [capital]);
  const bestScore = Math.max(0, ...radar.map((item) => item.score), ...watchlist.map((item) => item.score));

  const refreshClock = useCallback(async () => {
    try {
      const response = await fetch("/api/market/clock", { cache: "no-store" });
      const data = (await readApiResponse(response)) as ClockData;
      setMarketOpen(Boolean(data.isOpen));
      setClockReady(true);
      if (!response.ok && data.error) setWarning(data.error);
      return Boolean(data.isOpen);
    } catch (err) {
      setClockReady(true);
      setMarketOpen(false);
      setWarning(err instanceof Error ? err.message : "تعذر قراءة حالة السوق");
      return false;
    }
  }, []);

  const analyze = useCallback(async (automatic = false) => {
    if (scanningRef.current) return;
    scanningRef.current = true;
    setLoading(true);
    setError("");
    if (!automatic) setNarrative("");

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ market: "US", capital, riskPct, automatic }),
      });
      const data = await readApiResponse(response);
      if (!response.ok) throw new Error(data.error || "تعذر التحليل");

      setRadar((previous) => mergeRadar(previous, data.picks || []));
      setWatchlist(data.watchlist || []);
      setNarrative(data.narrative || data.message || "");
      setWarning(data.warning || "");
      setScanned(data.scanned || 0);
      setProvider(data.provider || "");
      setLastScan(new Date().toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
      setNextScanAt(new Date(Date.now() + AUTO_SCAN_MS));
    } catch (err) {
      setError(err instanceof Error ? err.message : "حدث خطأ غير متوقع");
    } finally {
      scanningRef.current = false;
      setLoading(false);
    }
  }, [capital, riskPct]);

  useEffect(() => {
    let scanTimer: ReturnType<typeof setInterval> | undefined;
    let clockTimer: ReturnType<typeof setInterval> | undefined;

    async function start() {
      const open = await refreshClock();
      if (open && autoEnabled) await analyze(true);
      scanTimer = setInterval(async () => {
        const isOpen = await refreshClock();
        if (isOpen && autoEnabled) await analyze(true);
      }, AUTO_SCAN_MS);
      clockTimer = setInterval(refreshClock, CLOCK_REFRESH_MS);
    }

    start();
    return () => {
      if (scanTimer) clearInterval(scanTimer);
      if (clockTimer) clearInterval(clockTimer);
    };
  }, [analyze, autoEnabled, refreshClock]);

  function tradePlan(pick: Pick, index = 0) {
    const allocation = tradableCapital * ([0.4, 0.35, 0.25][index] ?? 0.2);
    const stop = pick.price * (1 - pick.stopDistancePct / 100);
    const riskPerShare = Math.max(0.01, pick.price - stop);
    const maxRisk = capital * riskPct / 100;
    const quantity = Math.max(0, Math.min(Math.floor(allocation / pick.price), Math.floor(maxRisk / riskPerShare)));
    const technicalTarget = pick.price * (1 + Math.max(0, pick.resistanceDistancePct) / 100);
    const target1 = Math.min(technicalTarget, pick.price + riskPerShare);
    const target2 = Math.min(technicalTarget, pick.price + riskPerShare * 2);
    return { stop, target1, target2, quantity };
  }

  function StockCard({ pick, index, compact = false }: { pick: Pick; index: number; compact?: boolean }) {
    const plan = tradePlan(pick, index);
    const tone = scoreTone(pick.score);
    return (
      <article className={`stock-card ${tone} ${compact ? "compact-card" : ""}`}>
        <div className="card-top">
          <div><span className="rank">#{index + 1} فرصة 90+</span><h2>{pick.symbol}</h2><p className="stock-name">{pick.name}</p></div>
          <div className={`score-badge ${tone}`}><strong>{pick.score}</strong><small>/100</small></div>
        </div>
        <div className={`decision-pill ${tone}`}>{pick.breakout === "retest" ? "إعادة اختبار" : pick.breakout === "early" ? "اختراق مبكر" : "شراء مشروط"}</div>
        <div className="score-track"><span style={{ width: `${Math.min(100, pick.score)}%` }} /></div>
        <div className="indicator-grid">
          <div><span>السعر الحالي</span><strong>{pick.price.toFixed(2)} $</strong></div>
          <div><span>التغير</span><strong>{pick.changePct.toFixed(2)}%</strong></div>
          <div><span>RSI</span><strong>{pick.rsi.toFixed(1)}</strong></div>
          <div><span>RVOL</span><strong>{pick.volumeRatio.toFixed(2)}</strong></div>
        </div>
        <div className="trade-grid">
          <div><span>منطقة الشراء</span><strong>{(pick.price * 0.995).toFixed(2)}–{(pick.price * 1.005).toFixed(2)} $</strong></div>
          <div><span>وقف الخسارة</span><strong>{plan.stop.toFixed(2)} $</strong></div>
          <div><span>الهدف الأول</span><strong>{plan.target1.toFixed(2)} $</strong></div>
          <div><span>الهدف الثاني</span><strong>{plan.target2.toFixed(2)} $</strong></div>
          {!compact && <><div><span>الكمية المقترحة</span><strong>{plan.quantity} سهم</strong></div><div><span>MACD</span><strong>{indicatorLabel(pick.macdSignal)}</strong></div></>}
        </div>
        {!compact && <details className="analysis-details"><summary>عرض التحليل الكامل</summary><div className="details-content"><p><b>المقاومة التالية:</b> {pick.resistanceDistancePct.toFixed(2)}%</p>{!!pick.reasons?.length && <ul>{pick.reasons.slice(0, 6).map((reason) => <li key={reason}>{reason}</li>)}</ul>}</div></details>}
      </article>
    );
  }

  return (
    <main>
      <nav className="topbar"><div className="brand">MAHER HERO <span>AI</span></div><div className={`live ${marketOpen ? "is-live" : ""}`}><i /> {marketOpen ? "السوق الأمريكي مفتوح" : "السوق الأمريكي مغلق"}</div></nav>

      <header className="hero"><div><div className="badge">Maher Hero AI — v3.0</div><h1>رادار الأسهم الأمريكي</h1><p>فحص تلقائي كل 10 دقائق أثناء جلسة السوق، مع عرض الفرص التي تتجاوز 90/100 وخطة الدخول والبيع.</p></div><aside className="market-box"><span>حالة الرادار</span><strong>{loading ? "جارٍ الفحص" : autoEnabled ? "مراقبة تلقائية" : "متوقف يدويًا"}</strong><small>آخر فحص: {lastScan}</small><small>الفحص القادم: {nextScanAt ? nextScanAt.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" }) : "عند افتتاح السوق"}</small></aside></header>

      <section className="workspace">
        <div className="main-column">
          <section className="panel controls us-controls">
            <label>رأس المال<input type="number" min="100" value={capital} onChange={(e) => setCapital(Number(e.target.value))} /></label>
            <label>المخاطرة لكل صفقة %<input type="number" min="0.1" max="3" step="0.1" value={riskPct} onChange={(e) => setRiskPct(Number(e.target.value))} /></label>
            <button onClick={() => analyze(false)} disabled={loading}>{loading ? "جارٍ فحص السوق..." : "فحص الآن"}</button>
            <button className="secondary-button" onClick={() => setAutoEnabled((value) => !value)}>{autoEnabled ? "إيقاف الفحص التلقائي" : "تشغيل الفحص التلقائي"}</button>
          </section>

          {loading && <section className="scanner panel"><div className="scan-head"><strong>جارٍ تحليل السوق الأمريكي</strong><span>MACD • RSI • RVOL • الاختراق</span></div><div className="progress"><b /></div></section>}

          <section className="summary"><article><span>رأس المال</span><strong>{capital.toLocaleString()} $</strong></article><article><span>المتاح للتداول</span><strong>{tradableCapital.toLocaleString()} $</strong></article><article><span>الأسهم المفحوصة</span><strong>{scanned || "—"}</strong></article><article><span>فرص 90+</span><strong>{radar.length}</strong></article></section>

          {(provider || scanned > 0) && <section className="decision-board panel"><div className="decision-main"><span>قرار ماهر هيرو</span><strong className={radar.length ? "positive" : "caution"}>{radar.length ? "توجد فرص جاهزة للمراجعة" : "لا توجد فرصة 90+ حاليًا"}</strong><small>التنفيذ مشروط ببقاء السعر داخل منطقة الدخول وثبات الحجم.</small></div><div className="decision-stats"><div><span>أعلى تقييم</span><strong>{bestScore || "—"}</strong></div><div><span>فرص الرادار</span><strong>{radar.length}</strong></div><div><span>حالة السوق</span><strong>{marketOpen ? "مفتوح" : "مغلق"}</strong></div><div><span>المصدر</span><strong>{provider || "alpaca"}</strong></div></div></section>}

          {error && <p className="error">{error}</p>}
          {warning && <p className="warning-box">تنبيه البيانات: {warning}</p>}
          {!clockReady && <p className="warning-box">جارٍ التحقق من حالة السوق...</p>}
          {narrative && <section className="panel ai-summary"><div className="section-title"><div><small>نتيجة آخر فحص</small><span>قراءة ماهر هيرو</span></div><em>AI</em></div><details open><summary>عرض الملخص</summary><p>{narrative}</p></details></section>}

          {!!radar.length && <><section className="section-title opportunities"><div><small>تجاوزت 90/100</small><span>الفرص الحالية</span></div><b>{radar.length}</b></section><section className="cards">{radar.slice(0, 6).map((pick, index) => <StockCard key={pick.symbol} pick={pick} index={index} />)}</section></>}
          {!loading && scanned > 0 && !radar.length && <section className="empty-state panel"><strong>لا توجد فرصة 90+ حاليًا</strong><p>سيعيد الرادار الفحص تلقائيًا بعد 10 دقائق ما دام السوق مفتوحًا.</p></section>}
        </div>

        <aside className="radar-sidebar panel">
          <div className="sidebar-head"><div><small>قائمة مباشرة</small><h3>رادار 90+</h3></div><span className={marketOpen ? "pulse-dot active" : "pulse-dot"} /></div>
          <p className="sidebar-note">تتحدث تلقائيًا كل 10 دقائق أثناء الجلسة.</p>
          <div className="sidebar-list">
            {radar.length ? radar.map((pick, index) => { const plan = tradePlan(pick, index); const meta = pick as RadarPick; return <div className="radar-row" key={pick.symbol}><div className="radar-row-top"><strong>{pick.symbol}</strong><b>{pick.score}</b></div><div className="radar-price"><span>شراء</span><strong>{pick.price.toFixed(2)} $</strong></div><div className="radar-targets"><span>بيع 1: {plan.target1.toFixed(2)} $</span><span>بيع 2: {plan.target2.toFixed(2)} $</span><span>وقف: {plan.stop.toFixed(2)} $</span></div><small>منذ {new Date(meta.detectedAt).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })} • تحديث {new Date(meta.updatedAt).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}</small></div>; }) : <div className="sidebar-empty">لا توجد فرصة فوق 90 حاليًا.</div>}
          </div>
        </aside>
      </section>

      <footer>النتائج تحليلية وليست ضمانًا للربح. تحقق من السعر والسيولة في منصة التداول قبل التنفيذ.</footer>
    </main>
  );
}
