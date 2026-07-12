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
  classification: "شراء مشروط" | "مراقبة" | "استبعاد";
  reasons: string[];
};

export function scoreMaherHero(stock: StockSnapshot): HeroScore {
  let score = 0;
  const reasons: string[] = [];

  if (stock.trend === "up") {
    score += 15;
    reasons.push("الاتجاه العام صاعد");
  } else if (stock.trend === "sideways") {
    score += 7;
  }

  if (stock.macdSignal === "bullish") {
    score += 15;
    reasons.push("MACD إيجابي");
  } else if (stock.macdSignal === "neutral") {
    score += 6;
  }

  if (stock.rsi >= 48 && stock.rsi <= 68) {
    score += 10;
    reasons.push("RSI في منطقة زخم مناسبة");
  } else if (stock.rsi >= 35 && stock.rsi < 48) {
    score += 5;
  }

  if (stock.volumeRatio >= 2) {
    score += 20;
    reasons.push("حجم التداول أعلى من المتوسط بوضوح");
  } else if (stock.volumeRatio >= 1.3) {
    score += 12;
  }

  if (stock.breakout === "early") {
    score += 15;
    reasons.push("بداية اختراق وليست مطاردة متأخرة");
  } else if (stock.breakout === "retest") {
    score += 14;
    reasons.push("إعادة اختبار ناجحة");
  } else if (stock.breakout === "late") {
    score -= 20;
    reasons.push("الحركة متأخرة وقد أكمل السهم معظم صعوده");
  }

  if (stock.resistanceDistancePct >= 4) {
    score += 10;
    reasons.push("مساحة صعود جيدة قبل المقاومة");
  } else if (stock.resistanceDistancePct >= 2) {
    score += 5;
  }

  if (stock.stopDistancePct > 0 && stock.stopDistancePct <= 3) {
    score += 5;
    reasons.push("وقف الخسارة الفني قريب ومنطقي");
  }

  score = Math.max(0, Math.min(100, score));

  return {
    score,
    classification: score >= 88 ? "شراء مشروط" : score >= 72 ? "مراقبة" : "استبعاد",
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
