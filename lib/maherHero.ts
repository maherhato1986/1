export type Market = "US" | "SA";

export type StockSnapshot = {
  symbol: string;
  name: string;
  market: Market;
  price: number;
  changePct: number;
  volumeRatio: number;
  rsi: number;
  macdSignal: "bullish" | "bearish" | "neutral";
  trend: "up" | "down" | "sideways";
  breakout: "early" | "retest" | "late" | "none";
  resistanceDistancePct: number;
  stopDistancePct: number;
  pullbackFromHighPct?: number;
  sessionGainPct?: number;
};

export type ScoreBreakdown = {
  trend: number;
  macd: number;
  rsi: number;
  volume: number;
  breakout: number;
  resistance: number;
  risk: number;
};

export type HeroScore = {
  score: number;
  classification: "شراء مشروط" | "مراقبة" | "انتظار إعادة الاختبار" | "متأخر — لا تطارد السهم" | "استبعاد";
  reasons: string[];
  warnings: string[];
  breakdown: ScoreBreakdown;
};

export function scoreMaherHero(stock: StockSnapshot): HeroScore {
  const reasons: string[] = [];
  const warnings: string[] = [];
  const breakdown: ScoreBreakdown = { trend: 0, macd: 0, rsi: 0, volume: 0, breakout: 0, resistance: 0, risk: 0 };

  if (stock.trend === "up") {
    breakdown.trend = 15;
    reasons.push("الاتجاه العام صاعد");
  } else if (stock.trend === "sideways") {
    breakdown.trend = 5;
    warnings.push("الاتجاه جانبي ويحتاج تأكيدًا");
  }

  if (stock.macdSignal === "bullish") {
    breakdown.macd = 15;
    reasons.push("MACD إيجابي والزخم يتحسن");
  } else if (stock.macdSignal === "neutral") {
    breakdown.macd = 5;
  }

  if (stock.rsi >= 52 && stock.rsi <= 66) {
    breakdown.rsi = 15;
    reasons.push("RSI في منطقة زخم مثالية");
  } else if (stock.rsi >= 48 && stock.rsi <= 70) {
    breakdown.rsi = 8;
  } else if (stock.rsi > 70) {
    warnings.push("RSI مرتفع وقد يكون الدخول متأخرًا");
  }

  if (stock.volumeRatio >= 3) {
    breakdown.volume = 20;
    reasons.push("RVOL أعلى من 3 والسيولة قوية");
  } else if (stock.volumeRatio >= 2.5) {
    breakdown.volume = 17;
  } else if (stock.volumeRatio >= 2) {
    breakdown.volume = 13;
  } else if (stock.volumeRatio >= 1.5) {
    breakdown.volume = 7;
  } else {
    warnings.push("حجم التداول دون الحد المفضل");
  }

  if (stock.breakout === "early") {
    breakdown.breakout = 20;
    reasons.push("بداية اختراق وليست مطاردة بعد اكتمال الحركة");
  } else if (stock.breakout === "retest") {
    breakdown.breakout = 19;
    reasons.push("إعادة اختبار ناجحة بعد الاختراق");
  } else if (stock.breakout === "late") {
    warnings.push("الحركة متأخرة وقد أكمل السهم معظم صعوده");
  }

  if (stock.resistanceDistancePct >= 5) {
    breakdown.resistance = 10;
    reasons.push("مساحة صعود جيدة حتى المقاومة التالية");
  } else if (stock.resistanceDistancePct >= 3.5) {
    breakdown.resistance = 6;
  } else {
    warnings.push("المقاومة التالية قريبة");
  }

  if (stock.stopDistancePct > 0 && stock.stopDistancePct <= 3) {
    breakdown.risk = 5;
    reasons.push("وقف الخسارة الفني قريب");
  } else if (stock.stopDistancePct <= 4) {
    breakdown.risk = 2;
  } else {
    warnings.push("وقف الخسارة بعيد للمضاربة اليومية");
  }

  let score = Object.values(breakdown).reduce((sum, value) => sum + value, 0);
  const chasedMove = (stock.sessionGainPct ?? stock.changePct) > 80 && (stock.pullbackFromHighPct ?? 0) >= 20;
  if (chasedMove) {
    score = Math.min(score, 69);
    warnings.push("ارتفع السهم أكثر من 80% ثم تراجع بقوة من القمة");
  }

  const hardReject =
    stock.trend !== "up" ||
    stock.macdSignal !== "bullish" ||
    !["early", "retest"].includes(stock.breakout) ||
    stock.rsi < 48 ||
    stock.rsi > 70 ||
    stock.volumeRatio < 1.5 ||
    stock.resistanceDistancePct < 2 ||
    stock.stopDistancePct > 4 ||
    stock.changePct >= 25;

  if (hardReject) score = Math.min(score, 89);
  score = Math.max(0, Math.min(100, Math.round(score)));

  let classification: HeroScore["classification"] = "استبعاد";
  if (chasedMove || stock.breakout === "late") classification = "متأخر — لا تطارد السهم";
  else if (score >= 95) classification = "شراء مشروط";
  else if (stock.breakout === "none" && stock.trend === "up" && stock.macdSignal === "bullish") classification = "مراقبة";
  else if (stock.breakout === "retest" && score >= 85) classification = "انتظار إعادة الاختبار";

  return { score, classification, reasons, warnings, breakdown };
}

export function positionSize(params: {
  capital: number;
  riskPct: number;
  entry: number;
  stop: number;
  allocationLimit: number;
}) {
  const { capital, riskPct, entry, stop, allocationLimit } = params;
  const allowedRisk = capital * (riskPct / 100);
  const riskPerShare = Math.abs(entry - stop);
  if (riskPerShare <= 0 || entry <= 0) return 0;
  const byRisk = Math.floor(allowedRisk / riskPerShare);
  const byAllocation = Math.floor(allocationLimit / entry);
  return Math.max(0, Math.min(byRisk, byAllocation));
}
