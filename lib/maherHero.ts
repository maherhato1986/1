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
};

export type HeroScore = {
  score: number;
  classification: "فرصة مضاربة قوية" | "استبعاد";
  reasons: string[];
};

export function scoreMaherHero(stock: StockSnapshot): HeroScore {
  let score = 0;
  const reasons: string[] = [];

  // الاتجاه العام — 15 نقطة
  if (stock.trend === "up") {
    score += 15;
    reasons.push("الاتجاه العام صاعد");
  }

  // MACD — 15 نقطة
  if (stock.macdSignal === "bullish") {
    score += 15;
    reasons.push("MACD إيجابي ويدعم استمرار الزخم");
  }

  // RSI — 15 نقطة
  if (stock.rsi >= 52 && stock.rsi <= 66) {
    score += 15;
    reasons.push("RSI في منطقة زخم مثالية للمضاربة");
  } else if (stock.rsi >= 48 && stock.rsi <= 70) {
    score += 8;
  }

  // حجم التداول — 20 نقطة
  if (stock.volumeRatio >= 2.5) {
    score += 20;
    reasons.push("حجم التداول أعلى من المتوسط بقوة");
  } else if (stock.volumeRatio >= 2) {
    score += 15;
  } else if (stock.volumeRatio >= 1.5) {
    score += 8;
  }

  // الاختراق أو إعادة الاختبار — 20 نقطة
  if (stock.breakout === "early") {
    score += 20;
    reasons.push("السهم في بداية اختراق وليس بعد اكتمال الحركة");
  } else if (stock.breakout === "retest") {
    score += 19;
    reasons.push("إعادة اختبار ناجحة بعد الاختراق");
  } else if (stock.breakout === "late") {
    reasons.push("الحركة متأخرة وقد أكمل السهم معظم صعوده");
  }

  // المسافة حتى المقاومة — 10 نقاط
  if (stock.resistanceDistancePct >= 5) {
    score += 10;
    reasons.push("مساحة صعود جيدة قبل المقاومة التالية");
  } else if (stock.resistanceDistancePct >= 3.5) {
    score += 6;
  }

  // وقف الخسارة — 5 نقاط
  if (stock.stopDistancePct > 0 && stock.stopDistancePct <= 3) {
    score += 5;
    reasons.push("وقف الخسارة الفني قريب ومناسب للمضاربة اليومية");
  } else if (stock.stopDistancePct <= 4) {
    score += 2;
  }

  // استبعادات صارمة لاستراتيجية المضاربة اليومية
  const hardReject =
    stock.trend !== "up" ||
    stock.macdSignal !== "bullish" ||
    !["early", "retest"].includes(stock.breakout) ||
    stock.rsi < 48 ||
    stock.rsi > 70 ||
    stock.volumeRatio < 1.5 ||
    stock.resistanceDistancePct < 3.5 ||
    stock.stopDistancePct > 4 ||
    stock.changePct >= 12;

  if (hardReject) score = Math.min(score, 94);

  score = Math.max(0, Math.min(100, score));

  return {
    score,
    classification: score >= 95 ? "فرصة مضاربة قوية" : "استبعاد",
    reasons,
  };
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
