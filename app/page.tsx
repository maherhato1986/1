"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

type Pick={
 symbol:string;name:string;market:"US";price:number;changePct:number;volumeRatio:number;rsi:number;
 macdSignal:"bullish"|"bearish"|"neutral";trend:"up"|"down"|"sideways";
 breakout:"early"|"retest"|"late"|"none";resistanceDistancePct:number;stopDistancePct:number;
 score:number;classification:string;reasons:string[];warnings?:string[];
 entryLow:number;entryHigh:number;stopLoss:number;target1:number;target2:number;target3:number;
 buyTiming:string;sellTiming:string;preferredSession:string;invalidation:string;riskReward:number;
};
type RadarPick=Pick&{detectedAt:string;updatedAt:string};
type Quote={symbol:string;price?:number;changePct?:number;rsi?:number;macdSignal?:"bullish"|"bearish"|"neutral";volumeRatio?:number;resistance?:number;support?:number;atr?:number;signal?:"hold"|"near_target"|"partial_sell"|"exit"|"danger";reasons?:string[];updatedAt?:string;error?:string};
type Holding={id:string;symbol:string;buyPrice:number;quantity:number;buyDate:string;buyFee:number;customTarget?:number;manualPrice?:number;note?:string;longTerm:boolean;createdAt:string};
type Sale={id:string;symbol:string;quantity:number;buyPrice:number;sellPrice:number;fee:number;soldAt:string;realized:number};
type View=Holding&{quote?:Quote;price:number;priceSource:string;marketValue:number;cost:number;pnl:number;pnlPct:number;breakEven:number;target1:number;target2:number;protectiveStop:number;status:string;stateTone:"safe"|"warning"|"danger";advice:string};

const HOLDINGS_KEY="maher-hero-holdings-v2";
const SALES_KEY="maher-hero-sales-v1";
const DEFAULT_HOLDINGS:Holding[]=[["JLHL",17.08,26],["JSPR",0.6628,300],["TNDM",16.30,16],["AMWL",11.49,10],["FIG",24.09,4],["KLXE",2.60,100],["OPEN",4.67,25],["INTC",110.58,4]].map(([symbol,buyPrice,quantity])=>({id:`seed-${symbol}`,symbol:String(symbol),buyPrice:Number(buyPrice),quantity:Number(quantity),buyDate:"2026-07-13",buyFee:0,longTerm:false,createdAt:new Date().toISOString()}));

async function json(response:Response){const type=response.headers.get("content-type")||"";if(!type.includes("application/json"))throw new Error(`تعذر الوصول للخدمة (${response.status})`);return response.json()}
function money(value:number){const digits=Math.abs(value)<1?4:2;return `${value.toLocaleString("en-US",{minimumFractionDigits:digits,maximumFractionDigits:digits})} $`}
function holdingState(h:{quote?:Quote;pnlPct:number;price:number;breakEven:number;target1:number;longTerm:boolean}){
 const q=h.quote;const breakEvenDistance=h.breakEven?Math.abs((h.price-h.breakEven)/h.breakEven)*100:999;
 if(h.longTerm)return{status:"استثمار طويل",tone:"safe" as const};
 if(h.pnlPct<=-20)return{status:"خسارة كبيرة",tone:"danger" as const};
 if(q?.signal==="danger")return{status:"خطر كسر دعم",tone:"danger" as const};
 if(breakEvenDistance<=1)return{status:"قريب من التعادل",tone:"warning" as const};
 if(h.pnlPct<0&&q?.macdSignal==="bullish")return{status:"تعافٍ محتمل",tone:"warning" as const};
 if(h.pnlPct<0)return{status:"تحت سعر التكلفة",tone:"danger" as const};
 if(q?.signal==="exit")return{status:"إشارة خروج",tone:"danger" as const};
 if(q?.signal==="partial_sell")return{status:"منطقة جني أرباح",tone:"warning" as const};
 if(h.price>=h.target1*.98||q?.signal==="near_target")return{status:"قريب من الهدف",tone:"warning" as const};
 return{status:"احتفاظ رابح",tone:"safe" as const};
}
function adviceFor(h:{quote?:Quote;pnlPct:number;price:number;breakEven:number;target1:number;longTerm:boolean}){
 const q=h.quote;
 if(h.longTerm)return "استثمار طويل؛ راقب الدعم ولا تتخذ قرارًا لحظيًا.";
 if(h.pnlPct<=-20)return "خسارة كبيرة؛ لا يوجد هدف بيع قريب حاليًا، وتجنب التعزيز العشوائي.";
 if(q?.signal==="danger")return "الخطر مرتفع؛ راجع الدعم وخطة الخروج بدل انتظار التعادل بلا خطة.";
 if(Math.abs((h.price-h.breakEven)/h.breakEven)*100<=1)return "قريب من التعادل؛ راقب فرصة خروج آمنة.";
 if(h.pnlPct<0&&q?.macdSignal==="bullish")return "تعافٍ محتمل؛ انتظر تأكيد الزخم ولا تعتبره هدفًا متحققًا.";
 if(h.pnlPct<0)return "السهم تحت سعر التكلفة؛ راقب الدعم ولا تضف كمية جديدة.";
 if(q?.signal==="exit")return "الزخم انعكس؛ الخروج أو تقليل الكمية هو الأقرب.";
 if(q?.signal==="partial_sell")return "بيع جزءًا واحمِ الباقي بوقف متحرك.";
 if(q?.signal==="near_target"||h.price>=h.target1*.98)return "اقترب من الهدف؛ راقب الزخم وجهّز بيعًا جزئيًا.";
 return q?.macdSignal==="bullish"?"احتفاظ مع حماية الربح؛ الزخم ما زال إيجابيًا.":"احتفاظ بحذر؛ انتظر تأكيد زخم قبل أي قرار.";
}

export default function Home(){
 const [tab,setTab]=useState<"radar"|"portfolio"|"history">("portfolio");
 const [capital,setCapital]=useState(5000);const [riskPct,setRiskPct]=useState(1);const [loading,setLoading]=useState(false);
 const [radar,setRadar]=useState<RadarPick[]>([]);const [scanned,setScanned]=useState(0);const [opportunityCount,setOpportunityCount]=useState(0);const [provider,setProvider]=useState("");
 const [marketOpen,setMarketOpen]=useState(false);const [holdings,setHoldings]=useState<Holding[]>([]);const [sales,setSales]=useState<Sale[]>([]);const [quotes,setQuotes]=useState<Record<string,Quote>>({});
 const [portfolioLoading,setPortfolioLoading]=useState(false);const [showAdd,setShowAdd]=useState(false);const [error,setError]=useState("");const [portfolioUpdated,setPortfolioUpdated]=useState("لم يتم التحديث");
 const [form,setForm]=useState({symbol:"",buyPrice:"",quantity:"",buyDate:new Date().toISOString().slice(0,10),buyFee:"0",manualPrice:"",customTarget:"",note:""});
 const scanning=useRef(false);
 useEffect(()=>{try{const v2=localStorage.getItem(HOLDINGS_KEY);const v1=localStorage.getItem("maher-hero-holdings-v1");setHoldings(v2?JSON.parse(v2):v1?JSON.parse(v1):DEFAULT_HOLDINGS);setSales(JSON.parse(localStorage.getItem(SALES_KEY)||"[]"))}catch{setHoldings(DEFAULT_HOLDINGS)}},[]);
 useEffect(()=>{if(holdings.length||localStorage.getItem(HOLDINGS_KEY))localStorage.setItem(HOLDINGS_KEY,JSON.stringify(holdings))},[holdings]);
 useEffect(()=>{localStorage.setItem(SALES_KEY,JSON.stringify(sales))},[sales]);
 const refreshClock=useCallback(async()=>{try{const r=await fetch("/api/market/clock",{cache:"no-store"});const d=await json(r);setMarketOpen(Boolean(d.isOpen));return Boolean(d.isOpen)}catch{return false}},[]);
 const refreshPortfolio=useCallback(async()=>{if(!holdings.length)return;setPortfolioLoading(true);setError("");try{const r=await fetch("/api/portfolio/quotes",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({symbols:holdings.map(h=>h.symbol)})});const d=await json(r);if(!r.ok)throw new Error(d.error||"تعذر تحديث الأسعار");const next:Record<string,Quote>={};for(const q of d.quotes||[])next[q.symbol]=q;setQuotes(next);setPortfolioUpdated(new Date().toLocaleTimeString("ar-SA"))}catch(e){setError(e instanceof Error?e.message:"تعذر تحديث المحفظة")}finally{setPortfolioLoading(false)}},[holdings]);
 const analyze=useCallback(async()=>{if(scanning.current)return;scanning.current=true;setLoading(true);setError("");try{const r=await fetch("/api/analyze",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({market:"US",capital,riskPct,automatic:false})});const d=await json(r);if(!r.ok)throw new Error(d.error||"تعذر التحليل");const now=new Date().toISOString();setRadar((d.picks||[]).map((p:Pick)=>({...p,detectedAt:now,updatedAt:now})));setScanned(d.scanned||0);setOpportunityCount(d.opportunityCount||0);setProvider(d.provider||"alpaca-watchlist")}catch(e){setError(e instanceof Error?e.message:"تعذر التحليل")}finally{scanning.current=false;setLoading(false)}},[capital,riskPct]);
 useEffect(()=>{refreshClock();const c=setInterval(refreshClock,60000);return()=>clearInterval(c)},[refreshClock]);
 useEffect(()=>{if(!holdings.length)return;refreshPortfolio();const t=setInterval(()=>{if(marketOpen)refreshPortfolio()},60000);return()=>clearInterval(t)},[holdings.length,marketOpen,refreshPortfolio]);
 const views:View[]=useMemo(()=>holdings.map(h=>{const q=quotes[h.symbol];const price=h.manualPrice&&h.manualPrice>0?h.manualPrice:(q?.price||h.buyPrice);const priceSource=h.manualPrice&&h.manualPrice>0?"يدوي / منصة التداول":q?.price?"Alpaca IEX":"سعر الشراء مؤقتًا";const cost=h.buyPrice*h.quantity+h.buyFee;const marketValue=price*h.quantity;const pnl=marketValue-cost;const pnlPct=cost?pnl/cost*100:0;const breakEven=cost/Math.max(1,h.quantity);const atr=q?.atr||price*.03;const target1=h.customTarget||Math.max(breakEven,q?.resistance||price*1.06);const target2=Math.max(target1,price+atr*2);const protectiveStop=pnl>0?Math.max(breakEven,price-atr*1.2):(q?.support||price-atr*1.5);const state=holdingState({quote:q,pnlPct,price,breakEven,target1,longTerm:h.longTerm});const base={...h,quote:q,price,priceSource,marketValue,cost,pnl,pnlPct,breakEven,target1,target2,protectiveStop,status:state.status,stateTone:state.tone};return{...base,advice:adviceFor(base)}}),[holdings,quotes]);
 const portfolioValue=views.reduce((s,h)=>s+h.marketValue,0);const totalCost=views.reduce((s,h)=>s+h.cost,0);const totalPnl=views.reduce((s,h)=>s+h.pnl,0);const realized=sales.reduce((s,x)=>s+x.realized,0);
 function saveHolding(e:FormEvent){e.preventDefault();const symbol=form.symbol.trim().toUpperCase();const buyPrice=Number(form.buyPrice);const quantity=Number(form.quantity);if(!symbol||buyPrice<=0||quantity<=0){setError("أدخل رمزًا وسعر شراء وكمية صحيحة");return}setHoldings(v=>[{id:crypto.randomUUID(),symbol,buyPrice,quantity,buyDate:form.buyDate,buyFee:Number(form.buyFee)||0,manualPrice:Number(form.manualPrice)||undefined,customTarget:Number(form.customTarget)||undefined,note:form.note,longTerm:false,createdAt:new Date().toISOString()},...v]);setForm({symbol:"",buyPrice:"",quantity:"",buyDate:new Date().toISOString().slice(0,10),buyFee:"0",manualPrice:"",customTarget:"",note:""});setShowAdd(false)}
 function setManual(h:Holding){const raw=prompt(`أدخل سعر ${h.symbol} من منصة التداول. اتركه فارغًا للعودة إلى Alpaca.`,h.manualPrice?String(h.manualPrice):"");if(raw===null)return;const value=Number(raw);setHoldings(v=>v.map(x=>x.id===h.id?{...x,manualPrice:value>0?value:undefined}:x))}
 function sell(h:View){const qty=Number(prompt(`الكمية المباعة من ${h.symbol}`,String(h.quantity)));if(!qty||qty<=0||qty>h.quantity)return;const sellPrice=Number(prompt("سعر البيع",String(h.price)));if(!sellPrice||sellPrice<=0)return;const fee=Number(prompt("عمولة البيع","0"))||0;const realizedValue=(sellPrice-h.buyPrice)*qty-fee-h.buyFee*(qty/h.quantity);setSales(v=>[{id:crypto.randomUUID(),symbol:h.symbol,quantity:qty,buyPrice:h.buyPrice,sellPrice,fee,soldAt:new Date().toISOString(),realized:realizedValue},...v]);setHoldings(v=>v.flatMap(x=>x.id!==h.id?[x]:qty===x.quantity?[]:[{...x,quantity:x.quantity-qty,buyFee:x.buyFee*(x.quantity-qty)/x.quantity}]))}
 function remove(id:string){if(confirm("حذف السهم دون تسجيل عملية بيع؟"))setHoldings(v=>v.filter(x=>x.id!==id))}
 return <main>
  <nav className="topbar"><div className="brand">MAHER HERO <span>AI</span></div><div className={`live ${marketOpen?"is-live":""}`}><i/>{marketOpen?"السوق الأمريكي مفتوح":"السوق الأمريكي مغلق"}</div></nav>
  <header className="hero compact-hero"><div><div className="badge">Maher Hero AI — v4.6</div><h1>غرفة عمليات الأسهم</h1><p>تحليل كامل للقائمة مع مناطق الدخول والوقف والأهداف والتوقيت المفضل.</p></div><aside className="market-box"><span>آخر تحديث للمحفظة</span><strong>{portfolioUpdated}</strong><small>{portfolioLoading?"جارٍ تحديث الأسعار...":"تحديث تلقائي كل دقيقة أثناء الجلسة"}</small></aside></header>
  <section className="tabbar"><button className={tab==="radar"?"active":""} onClick={()=>setTab("radar")}>خطة الـ22 سهمًا</button><button className={tab==="portfolio"?"active":""} onClick={()=>setTab("portfolio")}>محفظتي <b>{holdings.length}</b></button><button className={tab==="history"?"active":""} onClick={()=>setTab("history")}>الأرباح المحققة</button></section>
  {error&&<p className="error">{error}</p>}
  {tab==="radar"&&<section>
   <section className="panel controls us-controls"><label>رأس المال<input name="capital" type="number" value={capital} onChange={e=>setCapital(Number(e.target.value))}/></label><label>المخاطرة %<input name="riskPct" type="number" step=".1" value={riskPct} onChange={e=>setRiskPct(Number(e.target.value))}/></label><button onClick={analyze} disabled={loading}>{loading?"جارٍ تحليل القائمة كاملة...":"فحص القائمة كاملة"}</button><div className="source-note">المصدر: {provider||"Alpaca Watchlist"}</div></section>
   <section className="summary"><article><span>أسهم القائمة المفحوصة</span><strong>{scanned||"—"}</strong></article><article><span>فرص 90+ الحقيقية</span><strong>{opportunityCount}</strong></article></section>
   {radar.length>0&&opportunityCount===0&&<p className="data-disclaimer">لا توجد فرصة فوق 90 حاليًا؛ كل بطاقة توضّح شروط الانتظار والدخول المشروط، وليست أمر شراء تلقائيًا.</p>}
   <section className="cards">{radar.map((p,i)=><article className={`stock-card ${p.score>=90?"strong":""}`} key={p.symbol}>
    <div className="card-top"><div><span className="rank">#{i+1}</span><h2>{p.symbol}</h2><p>{p.classification}</p></div><div className={`score-badge ${p.score>=90?"strong":""}`}><strong>{p.score}</strong><small>/100</small></div></div>
    <div className="indicator-grid"><div><span>السعر</span><strong>{money(p.price)}</strong></div><div><span>RSI</span><strong>{p.rsi.toFixed(1)}</strong></div><div><span>RVOL</span><strong>{p.volumeRatio.toFixed(2)}</strong></div><div><span>التغير</span><strong>{p.changePct.toFixed(2)}%</strong></div></div>
    <div className="indicator-grid"><div><span>منطقة الشراء</span><strong>{money(p.entryLow)} – {money(p.entryHigh)}</strong></div><div><span>وقف الخسارة</span><strong>{money(p.stopLoss)}</strong></div><div><span>الهدف 1</span><strong>{money(p.target1)}</strong></div><div><span>الهدف 2 / 3</span><strong>{money(p.target2)} / {money(p.target3)}</strong></div></div>
    <div className="data-disclaimer"><b>وقت الشراء:</b> {p.buyTiming}<br/><b>الوقت المفضل:</b> {p.preferredSession}<br/><b>خطة البيع:</b> {p.sellTiming}<br/><b>إلغاء الدخول:</b> {p.invalidation}<br/><b>العائد للمخاطرة:</b> 1 : {p.riskReward}</div>
   </article>)}</section>
  </section>}
  {tab==="portfolio"&&<section><section className="portfolio-actions panel"><div><h2>الأسهم المملوكة</h2><p>الحالة تعتمد على سعر التكلفة والربح أو الخسارة قبل إشارات الهدف.</p></div><div className="action-buttons"><button onClick={()=>setShowAdd(v=>!v)}>+ إضافة سهم</button><button className="secondary-button" onClick={refreshPortfolio} disabled={portfolioLoading}>{portfolioLoading?"جارٍ التحديث":"تحديث الأسعار"}</button></div></section>
   {showAdd&&<form className="panel holding-form" onSubmit={saveHolding}><label>الرمز<input name="symbol" value={form.symbol} onChange={e=>setForm({...form,symbol:e.target.value})}/></label><label>متوسط التكلفة<input name="buyPrice" type="number" step=".0001" value={form.buyPrice} onChange={e=>setForm({...form,buyPrice:e.target.value})}/></label><label>الكمية<input name="quantity" type="number" value={form.quantity} onChange={e=>setForm({...form,quantity:e.target.value})}/></label><label>سعر منصة التداول<input name="manualPrice" type="number" step=".0001" value={form.manualPrice} onChange={e=>setForm({...form,manualPrice:e.target.value})}/></label><label>تاريخ الشراء<input name="buyDate" type="date" value={form.buyDate} onChange={e=>setForm({...form,buyDate:e.target.value})}/></label><label>العمولة<input name="buyFee" type="number" step=".01" value={form.buyFee} onChange={e=>setForm({...form,buyFee:e.target.value})}/></label><label>هدف خاص<input name="customTarget" type="number" step=".0001" value={form.customTarget} onChange={e=>setForm({...form,customTarget:e.target.value})}/></label><label>ملاحظة<input name="note" value={form.note} onChange={e=>setForm({...form,note:e.target.value})}/></label><button>حفظ</button></form>}
   <section className="summary portfolio-summary"><article><span>إجمالي التكلفة</span><strong>{money(totalCost)}</strong></article><article><span>القيمة السوقية</span><strong>{money(portfolioValue)}</strong></article><article><span>الربح / الخسارة المفتوحة</span><strong className={totalPnl>=0?"positive":"negative"}>{money(totalPnl)}<small>{totalCost?` ${(totalPnl/totalCost*100).toFixed(2)}%`:""}</small></strong></article><article><span>الربح المحقق</span><strong className={realized>=0?"positive":"negative"}>{money(realized)}</strong></article></section>
   <div className="broker-table panel"><div className="broker-head"><span>السهم</span><span>الكمية</span><span>متوسط التكلفة</span><span>السعر الحالي</span><span>القيمة السوقية</span><span>ربح/خسارة</span><span>ربح/خسارة %</span><span>الحالة</span><span>النصيحة</span><span>الهدف 1 / 2</span><span>وقف الحماية</span><span>الإجراءات</span></div>{views.map(h=><div className={`broker-row ${h.stateTone}`} key={h.id}><div className="symbol-cell"><strong>{h.symbol}</strong><small>{h.longTerm?"استثمار طويل":"مضاربة"}</small></div><span>{h.quantity}</span><span>{money(h.buyPrice)}</span><span className="price-cell">{money(h.price)}</span><span>{money(h.marketValue)}</span><span className={h.pnl>=0?"positive":"negative"}><b>{money(h.pnl)}</b></span><span className={h.pnlPct>=0?"positive":"negative"}>{h.pnlPct.toFixed(2)}%</span><span><em className={`status ${h.stateTone}`}>{h.status}</em></span><span className={`advice-cell ${h.stateTone}`}>{h.advice}</span><span>{money(h.target1)}<small>{money(h.target2)}</small></span><span>{money(h.protectiveStop)}</span><div className="row-actions"><button onClick={()=>sell(h)}>تم البيع</button><button className="secondary-button" onClick={()=>setManual(h)}>تعديل السعر</button><button className="danger-button" onClick={()=>remove(h.id)}>حذف</button></div></div>)}</div>
   <p className="data-disclaimer">الحالة لا تعتبر السهم قريبًا من الهدف إلا إذا كان عند سعر التكلفة أو أعلى منه. إشارات المقاومة وحدها لا تكفي.</p></section>}
  {tab==="history"&&<section><section className="panel history-head"><div><h2>الأرباح المحققة</h2><p>عمليات البيع الكاملة والجزئية.</p></div><strong className={realized>=0?"positive":"negative"}>{money(realized)}</strong></section><div className="history-table panel"><div className="history-row header"><span>السهم</span><span>الكمية</span><span>الشراء</span><span>البيع</span><span>التاريخ</span><span>النتيجة</span></div>{sales.map(s=><div className="history-row" key={s.id}><b>{s.symbol}</b><span>{s.quantity}</span><span>{money(s.buyPrice)}</span><span>{money(s.sellPrice)}</span><span>{new Date(s.soldAt).toLocaleString("ar-SA")}</span><strong className={s.realized>=0?"positive":"negative"}>{money(s.realized)}</strong></div>)}</div></section>}
  <footer>البيانات تحليلية. تحقق من سعر التنفيذ في منصة التداول قبل البيع أو الشراء.</footer>
 </main>
}
