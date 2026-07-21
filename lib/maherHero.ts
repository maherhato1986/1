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
export type HeroScore = { score:number; executionEligible:boolean; blockedBy:string[]; classification:"شراء مشروط"|"قريب من الدخول"|"مراقبة"|"انتظار إعادة الاختبار"|"متأخر — لا تطارد السهم"|"سكالبينغ عالي المخاطرة"|"استبعاد"; reasons:string[]; warnings:string[]; breakdown:ScoreBreakdown };

export function scoreMaherHero(stock: StockSnapshot): HeroScore {
  const reasons:string[]=[]; const warnings:string[]=[]; const blockedBy:string[]=[];
  const breakdown:ScoreBreakdown={trend:0,macd:0,rsi:0,volume:0,breakout:0,resistance:0,risk:0};
  const f=stock.frames;

  // الاتجاه 25 نقطة: الأسبوعي 6، اليومي 8، الساعة 5، 15 دقيقة 3، 5 دقائق 3.
  const trendPoints=(signal:FrameSignal|undefined,max:number)=>{
    if(!signal)return 0;
    if(signal.trend==="up")return max;
    if(signal.trend==="sideways")return Math.round(max*0.35);
    return 0;
  };
  breakdown.trend=f
    ? trendPoints(f.weekly,6)+trendPoints(f.daily,8)+trendPoints(f.hourly,5)+trendPoints(f.m15,3)+trendPoints(f.m5,3)
    : stock.trend==="up"?25:stock.trend==="sideways"?8:0;
  if(breakdown.trend>=19)reasons.push("اتجاه متعدد الأطر متماسك");
  else warnings.push("الاتجاه عبر الأطر غير مكتمل");

  // MACD عشرون نقطة مع أولوية اليومي والأسبوعي.
  const macdPoints=(signal:FrameSignal|undefined,max:number)=>{
    if(!signal)return 0;
    if(signal.macdSignal==="bullish")return max;
    if(signal.macdSignal==="neutral")return Math.round(max*0.3);
    return 0;
  };
  breakdown.macd=f
    ? macdPoints(f.weekly,4)+macdPoints(f.daily,6)+macdPoints(f.hourly,4)+macdPoints(f.m15,3)+macdPoints(f.m5,3)
    : stock.macdSignal==="bullish"?20:stock.macdSignal==="neutral"?6:0;
  if(breakdown.macd>=15)reasons.push("MACD متوافق عبر الأطر");
  else warnings.push("توافق MACD غير مكتمل");

  // RSI عشر نقاط موزعة على اليومي والساعة و15 و5 دقائق.
  const rsiPoints=(signal:FrameSignal|undefined,max:number)=>{
    if(!signal||!Number.isFinite(signal.rsi))return 0;
    if(signal.rsi>=52&&signal.rsi<=68)return max;
    if(signal.rsi>=48&&signal.rsi<=72)return Math.round(max*0.6);
    return 0;
  };
  breakdown.rsi=f
    ? rsiPoints(f.daily,4)+rsiPoints(f.hourly,2)+rsiPoints(f.m15,2)+rsiPoints(f.m5,2)
    : stock.rsi>=52&&stock.rsi<=68?10:stock.rsi>=48&&stock.rsi<=72?6:0;

  if(stock.volumeRatio>=3){breakdown.volume=15;reasons.push("RVOL قوي جدًا")}
  else if(stock.volumeRatio>=2.5){breakdown.volume=13;reasons.push("RVOL قوي")}
  else if(stock.volumeRatio>=2){breakdown.volume=10}
  else if(stock.volumeRatio>=1.5){breakdown.volume=7}
  else warnings.push("حجم التداول أقل من شرط التنفيذ");

  if(stock.breakout==="early"){breakdown.breakout=15;reasons.push("اختراق مبكر")}
  else if(stock.breakout==="retest"){breakdown.breakout=14;reasons.push("إعادة اختبار ناجحة")}
  else if(stock.breakout==="late")warnings.push("الحركة متأخرة");
  else warnings.push("لا يوجد اختراق مؤكد");

  if(stock.resistanceDistancePct>=5)breakdown.resistance=10;
  else if(stock.resistanceDistancePct>=3.5)breakdown.resistance=7;
  else if(stock.resistanceDistancePct>=2)breakdown.resistance=4;
  else warnings.push("المقاومة أقرب من 2%");

  if(stock.stopDistancePct>0&&stock.stopDistancePct<=3)breakdown.risk=5;
  else if(stock.stopDistancePct<=4)breakdown.risk=3;
  else warnings.push("وقف الخسارة أبعد من 4%");

  let score=Object.values(breakdown).reduce((a,b)=>a+b,0);
  const chased=(stock.sessionGainPct??stock.changePct)>80&&(stock.pullbackFromHighPct??0)>=20;
  const higherBothDown=Boolean(f&&f.weekly.trend==="down"&&f.daily.trend==="down");
  const oneHigherDown=Boolean(f&&(f.weekly.trend==="down"||f.daily.trend==="down"));
  const onlyFiveMinute=Boolean(f&&f.weekly.trend!=="up"&&f.daily.trend!=="up"&&f.m5.trend==="up");

  if(higherBothDown){score=Math.min(score,65);blockedBy.push("الأسبوعي واليومي هابطان")}
  else if(oneHigherDown){score=Math.min(score,79);warnings.push("أحد الاتجاهات الكبرى هابط")}
  if(f?.daily.macdSignal==="bearish"){score=Math.min(score,74);blockedBy.push("MACD اليومي سلبي")}
  if(onlyFiveMinute){score=Math.min(score,64);blockedBy.push("التحسن محصور في 5 دقائق")}
  if(chased){score=Math.min(score,69);blockedBy.push("ارتفاع مبالغ ثم تراجع قوي")}

  if(stock.volumeRatio<1.5)blockedBy.push("RVOL أقل من 1.5");
  if(!["early","retest"].includes(stock.breakout))blockedBy.push("لا يوجد اختراق مبكر أو إعادة اختبار");
  if(stock.resistanceDistancePct<2)blockedBy.push("المقاومة أقرب من 2%");
  if(stock.stopDistancePct<=0||stock.stopDistancePct>4)blockedBy.push("الوقف يتجاوز 4%");
  if(stock.rsi<48||stock.rsi>70)blockedBy.push("RSI خارج نطاق التنفيذ");
  if(stock.changePct>=25)blockedBy.push("السهم ارتفع 25% أو أكثر");
  if(f&&f.m15.trend!=="up")blockedBy.push("اتجاه 15 دقيقة غير صاعد");
  if(f&&f.m5.trend!=="up")blockedBy.push("اتجاه 5 دقائق غير صاعد");
  if(stock.macdSignal!=="bullish")blockedBy.push("MACD خمس دقائق غير إيجابي");

  const executionEligible=blockedBy.length===0;
  score=Math.max(0,Math.min(100,Math.round(score)));

  let classification:HeroScore["classification"]="استبعاد";
  if(chased||stock.breakout==="late")classification="متأخر — لا تطارد السهم";
  else if(onlyFiveMinute)classification="سكالبينغ عالي المخاطرة";
  else if(executionEligible&&score>=85)classification="شراء مشروط";
  else if(executionEligible&&score>=70)classification="قريب من الدخول";
  else if(score>=65)classification="مراقبة";
  else if(stock.breakout==="retest"&&score>=60)classification="انتظار إعادة الاختبار";
  if(!executionEligible)warnings.push(...blockedBy.map((item)=>`منع التنفيذ: ${item}`));
  return {score,executionEligible,blockedBy,classification,reasons,warnings,breakdown};
}

export function positionSize(params:{capital:number;riskPct:number;entry:number;stop:number;allocationLimit:number}){
  const {capital,riskPct,entry,stop,allocationLimit}=params;const allowedRisk=capital*(riskPct/100);const riskPerShare=Math.abs(entry-stop);if(riskPerShare<=0||entry<=0)return 0;return Math.max(0,Math.min(Math.floor(allowedRisk/riskPerShare),Math.floor(allocationLimit/entry)));
}
