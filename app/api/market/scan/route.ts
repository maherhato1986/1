import { NextResponse } from "next/server";
import { Bar, completedBars, macdSignal, rsi, sma, trueRangeAverage } from "@/lib/indicators";
import { StockSnapshot } from "@/lib/maherHero";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

type BarsResponse = { bars?: Record<string, Bar[]>; next_page_token?: string | null };
const baseUrl = "https://data.alpaca.markets";

export const MAHER_HERO_WATCHLIST = [
  "TNDM", "ETOR", "JLHL", "EAH", "BBAR", "AMWL", "GMM", "JZXN", "IFBD", "CCC",
  "OPEN", "PYPL", "FIG", "TGHL", "KLXE", "IBKR", "HPE", "MCHP", "OXY", "LVS", "BKR", "VLO",
] as const;

function headers() {
  const key = process.env.ALPACA_API_KEY;
  const secret = process.env.ALPACA_API_SECRET;
  if (!key || !secret) return null;
  return { "APCA-API-KEY-ID": key, "APCA-API-SECRET-KEY": secret };
}

async function fetchJson<T>(url: string, authHeaders: Record<string, string>): Promise<T> {
  const response = await fetch(url, { headers: authHeaders, cache: "no-store", signal: AbortSignal.timeout(15000) });
  const contentType = response.headers.get("content-type") || "";
  if (!response.ok) {
    const details = await response.text();
    throw new Error(`تعذر جلب بيانات السوق (${response.status}): ${details.slice(0, 180)}`);
  }
  if (!contentType.includes("application/json")) {
    const details = await response.text();
    throw new Error(`مزود السوق أعاد استجابة غير صالحة: ${details.slice(0, 120)}`);
  }
  return response.json() as Promise<T>;
}

function breakoutContext(bars: Bar[], price: number, changePct: number) {
  const current = bars.at(-1)!;
  const prior = bars.slice(-21, -1);
  const previousResistance = Math.max(...prior.map((bar) => bar.h));
  const recentLow = Math.min(...bars.slice(-4).map((bar) => bar.l));
  let breakout: StockSnapshot["breakout"] = "none";
  if (changePct >= 25) breakout = "late";
  else if (current.c > previousResistance && changePct <= 12) breakout = "early";
  else if (recentLow <= previousResistance * 1.006 && current.c >= previousResistance && changePct <= 15) breakout = "retest";

  const historicalHighsAbovePrice = bars.slice(0, -21).map((bar) => bar.h).filter((high) => high > price * 1.005);
  const nextResistance = historicalHighsAbovePrice.length ? Math.min(...historicalHighsAbovePrice) : null;
  return { breakout, nextResistance };
}

function buildSnapshot(symbol: string, rawBars: Bar[]): StockSnapshot | null {
  const bars = completedBars(rawBars, 5);
  if (bars.length < 40) return null;
  const closes = bars.map((bar) => bar.c);
  const volumes = bars.map((bar) => bar.v);
  const current = bars.at(-1)!;
  const previousSessionBars = bars.slice(0, -1).filter((bar) => {
    const currentDay = new Date(current.t).toISOString().slice(0, 10);
    return new Date(bar.t).toISOString().slice(0, 10) !== currentDay;
  });
  const previousClose = previousSessionBars.at(-1)?.c ?? bars.at(-2)!.c;
  const price = current.c;
  if (!price || price < 0.1 || price > 1000) return null;

  const changePct = ((price - previousClose) / previousClose) * 100;
  const averageVolume = Math.max(1, sma(volumes.slice(-21, -1), 20));
  const volumeRatio = current.v / averageVolume;
  const ema20 = sma(closes, 20);
  const trend = current.c > ema20 * 1.004 ? "up" : current.c < ema20 * 0.996 ? "down" : "sideways";
  const atr = trueRangeAverage(bars, 14);
  const { breakout, nextResistance } = breakoutContext(bars, price, changePct);
  const fallbackDistance = Math.max(3.5, Math.min(10, (atr / price) * 200));
  const resistanceDistancePct = nextResistance ? ((nextResistance - price) / price) * 100 : fallbackDistance;
  const stopDistancePct = Math.min(7, Math.max(1.2, (atr / price) * 100 * 1.25));
  const intraday = bars.slice(-78);
  const intradayHigh = Math.max(...intraday.map((bar) => bar.h));
  const pullbackFromHighPct = intradayHigh > 0 ? ((intradayHigh - price) / intradayHigh) * 100 : 0;

  return {
    symbol,
    name: symbol,
    market: "US",
    price,
    changePct,
    sessionGainPct: changePct,
    pullbackFromHighPct,
    volumeRatio,
    rsi: rsi(closes, 14),
    macdSignal: macdSignal(closes),
    trend,
    breakout,
    resistanceDistancePct: Math.max(0, resistanceDistancePct),
    stopDistancePct,
  };
}

export async function GET(request: Request) {
  const authHeaders = headers();
  if (!authHeaders) {
    return NextResponse.json({ mode: "demo", error: "أضف ALPACA_API_KEY وALPACA_API_SECRET في Vercel لتفعيل بيانات السوق الحقيقي.", stocks: [] });
  }

  try {
    const symbols = [...MAHER_HERO_WATCHLIST];
    const start = new Date(Date.now() - 1000 * 60 * 60 * 24 * 10).toISOString();
    const barsUrl = new URL(`${baseUrl}/v2/stocks/bars`);
    barsUrl.searchParams.set("symbols", symbols.join(","));
    barsUrl.searchParams.set("timeframe", "5Min");
    barsUrl.searchParams.set("start", start);
    barsUrl.searchParams.set("limit", "10000");
    barsUrl.searchParams.set("adjustment", "raw");
    barsUrl.searchParams.set("feed", "iex");

    const barsData = await fetchJson<BarsResponse>(barsUrl.toString(), authHeaders);
    const stocks = symbols
      .map((symbol) => buildSnapshot(symbol, barsData.bars?.[symbol] ?? []))
      .filter((stock): stock is StockSnapshot => Boolean(stock));
    const debug = new URL(request.url).searchParams.get("debug") === "1";

    return NextResponse.json({
      mode: "live",
      provider: "alpaca-watchlist",
      scanned: symbols.length,
      analyzed: stocks.length,
      stocks,
      watchlist: symbols,
      warning: stocks.length < symbols.length ? `تعذر بناء تحليل كامل لـ ${symbols.length - stocks.length} سهم بسبب نقص البيانات اللحظية.` : undefined,
      timestamp: new Date().toISOString(),
      ...(debug ? { diagnostics: { symbolsRequested: symbols.length, symbolsWithBars: Object.keys(barsData.bars ?? {}).length, snapshotsBuilt: stocks.length, start, nextPageToken: barsData.next_page_token ?? null } } : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر فحص قائمة ماهر هيرو";
    return NextResponse.json({ mode: "error", error: message, stocks: [] }, { status: 502 });
  }
}
