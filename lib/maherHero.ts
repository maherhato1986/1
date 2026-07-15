export type Market = "US" | "SA";
export type Direction = "up" | "down" | "sideways";
export type FrameSignal = { trend: Direction; rsi: number; macdSignal: "bullish" | "bearish" | "neutral" };

export type StockSnapshot = {
  symbol: string;
  name: string;
  market: Market;
  price: number;
  changePct: number;
  volumeRatio: number;
  rsi: number;
  macdSignal: "bullish" | "bearish" | "neutral";
  trend: Direction;
  breakout: "early" | "retest" | "late" | "none";
  resistanceDistancePct: number;
  stopDistancePct: number;
  pullbackFromHighPct?: number;
  sessionGainPct?: number;
  frames?: { weekly: FrameSignal; daily: FrameSignal; hourly: FrameSignal; m15: FrameSignal; m5: FrameSignal };
};

export type ScoreBreakdown = { trend:number; macd:number; rsi:number; volume:number; breakout:number; resistance:number; risk:number };
export type HeroScore = { score:number; classification:"شراء مشروط"|"قريب من الدخول"|"مراقبة"|"انتظار إعادة الاختبار"|"متأخر — لا تطارد السهم"|"سكالبينغ عالي المخاطرة"|"استبعاد"; reasons:string[]; warnings:string[]; breakdown:ScoreBreakdown };

export function scoreMaherHero(stock: StockSnapshot): HeroScore {
  const reasons:string[]=[]; const warnings:string[]=[];
  const breakdown:ScoreBreakdown={trend:0,macd:0,rsi:0,volume:0,breakout:0,resistance:0,risk:0};
  if(stock.trend==="up"){breakdown.trend=15;reasons.push("الاتجاه القصير صاعد")}else if(stock.trend==="sideways"){breakdown.trend=5;warnings.push("الاتجاه القصير جانبي")}
  if(stock.macdSignal==="bullish"){breakdown.macd=15;reasons.push("MACD القصير إيجابي")}else if(stock.macdSignal==="neutral")breakdown.macd=5;
  if(stock.rsi>=52&&stock.rsi<=66){breakdown.rsi=15;reasons.push("RSI القصير في منطقة زخم مناسبة")}else if(stock.rsi>=48&&stock.rsi<=70)breakdown.rsi=8;else if(stock.rsi>70)warnings.push("RSI القصير مرتفع");
  if(stock.volumeRatio>=3){breakdown.volume=20;reasons.push("RVOL قوي")}else if(stock.volumeRatio>=2.5)breakdown.volume=17;else if(stock.volumeRatio>=2)breakdown.volume=13;else if(stock.volumeRatio>=1.5)breakdown.volume=7;else warnings.push("حجم التداول ضعيف");
  if(stock.breakout==="early"){breakdown.breakout=20;reasons.push("بداية اختراق")}else if(stock.breakout==="retest"){breakdown.breakout=19;reasons.push("إعادة اختبار")}else if(stock.breakout==="late")warnings.push("الحركة متأخرة");
  if(stock.resistanceDistancePct>=5)breakdown.resistance=10;else if(stock.resistanceDistancePct>=3.5)breakdown.resistance=6;else warnings.push("المقاومة قريبة");
  if(stock.stopDistancePct>0&&stock.stopDistancePct<=3)breakdown.risk=5;else if(stock.stopDistancePct<=4)breakdown.risk=2;else warnings.push("وقف الخسارة بعيد");

  let score=Object.values(breakdown).reduce((a,b)=>a+b,0);
  const chased=(stock.sessionGainPct??stock.changePct)>80&&(stock.pullbackFromHighPct??0)>=20;
  if(chased){score=Math.min(score,69);warnings.push("ارتفاع مبالغ ثم تراجع قوي")}

  const f=stock.frames;
  if(f){
    const higherDown=f.weekly.trend==="down"&&f.daily.trend==="down";
    const belowHigher=f.daily.trend==="down"||f.weekly.trend==="down";
    if(higherDown){score=Math.min(score,65);warnings.push("الأسبوعي واليومي هابطان؛ تم تقييد الدرجة عند 65")}
    else if(belowHigher){score=Math.min(score,79);warnings.push("الاتجاه الأكبر غير صاعد؛ الزخم القصير لا يكفي")}
    if(f.daily.macdSignal==="bearish") {score=Math.min(score,74);warnings.push("MACD اليومي سلبي")}
    if(f.weekly.trend!=="up"&&f.daily.trend!=="up"&&f.m5.trend==="up") {score=Math.min(score,64);warnings.push("التحسن محصور في 5 دقائق فقط")}
  }

  const hardReject=stock.trend!=="up"||stock.macdSignal!=="bullish"||!["early","retest"].includes(stock.breakout)||stock.rsi<48||stock.rsi>70||stock.volumeRatio<1.5||stock.resistanceDistancePct<2||stock.stopDistancePct>4||stock.changePct>=25;
  if(hardReject)score=Math.min(score,89);
  score=Math.max(0,Math.min(100,Math.round(score)));

  let classification:HeroScore["classification"]="استبعاد";
  if(chased||stock.breakout==="late")classification="متأخر — لا تطارد السهم";
  else if(f&&f.weekly.trend!=="up"&&f.daily.trend!=="up"&&f.m5.trend==="up")classification="سكالبينغ عالي المخاطرة";
  else if(score>=90)classification="شراء مشروط";
  else if(score>=80)classification="قريب من الدخول";
  else if(score>=65)classification="مراقبة";
  else if(stock.breakout==="retest"&&score>=60)classification="انتظار إعادة الاختبار";
  return {score,classification,reasons,warnings,breakdown};
}

export function positionSize(params:{capital:number;riskPct:number;entry:number;stop:number;allocationLimit:number}){
  const {capital,riskPct,entry,stop,allocationLimit}=params;const allowedRisk=capital*(riskPct/100);const riskPerShare=Math.abs(entry-stop);if(riskPerShare<=0||entry<=0)return 0;return Math.max(0,Math.min(Math.floor(allowedRisk/riskPerShare),Math.floor(allocationLimit/entry)));
}
