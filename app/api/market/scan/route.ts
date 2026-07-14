import { NextResponse } from "next/server";
import { Bar, completedBars, macdSignal, rsi, sma, trueRangeAverage } from "@/lib/indicators";
import { StockSnapshot } from "@/lib/maherHero";

type ScreenerItem = {
  symbol: string;
  percent_change?: number;
  change?: number;
  price?: number;
  volume?: number;
  trade?: { p?: number };
};

type BarsResponse = { bars?: Record<string, Bar[]>; next_page_token?: string | null };
const baseUrl = "https://data.alpaca.markets";

function headers() {
  const key = process.env.ALPACA_API_KEY;
  const secret = process.env.ALPACA_API_SECRET;
  if (!key || !secret) return null;
  return { "APCA-API-KEY-ID": key, "APCA-API-SECRET-KEY": secret };
}

async function fetchJson<T>(url: string, authHeaders: Record<string, string>): Promise<T> {
  const response = await fetch(url, { headers: authHeaders, cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!response.ok) {
    const details = await response.text();
    throw new Error(`تعذر جلب بيانات السوق (${response.status}): ${details.slice(0, 180)}`);
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

function buildSnapshot(symbol: string, rawBars: Bar[], screener?: ScreenerItem): StockSnapshot | null {
  const bars = completedBars(rawBars, 5);
  if (bars.length < 40) return null;
  const closes = bars.map((bar) => bar.c);
  const volumes = bars.map((bar) => bar.v);
  const current = bars.at(-1)!;
  const previous = bars.at(-2)!;
  const price = screener?.trade?.p ?? screener?.price ?? current.c;
  if (!price || price < 1 || price > 20) return null;

  const changePct = screener?.percent_change ?? ((current.c - previous.c) / previous.c) * 100;
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
    const [movers, actives] = await Promise.all([
      fetchJson<{ gainers?: ScreenerItem[] }>(`${baseUrl}/v1beta1/screener/stocks/movers?top=40`, authHeaders),
      fetchJson<{ most_actives?: ScreenerItem[] }>(`${baseUrl}/v1beta1/screener/stocks/most-actives?top=40&by=volume`, authHeaders),
    ]);
    const candidates = [...(movers.gainers ?? []), ...(actives.most_actives ?? [])];
    const bySymbol = new Map<string, ScreenerItem>();
    for (const item of candidates) if (item.symbol && !bySymbol.has(item.symbol)) bySymbol.set(item.symbol, item);
    const symbols = Array.from(bySymbol.keys()).slice(0, 40);
    if (!symbols.length) throw new Error("لم يرجع مزود السوق أسهمًا مرشحة حاليًا.");

    const start = new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString();
    const barsUrl = new URL(`${baseUrl}/v2/stocks/bars`);
    barsUrl.searchParams.set("symbols", symbols.join(","));
    barsUrl.searchParams.set("timeframe", "5Min");
    barsUrl.searchParams.set("start", start);
    barsUrl.searchParams.set("limit", "10000");
    barsUrl.searchParams.set("adjustment", "raw");
    barsUrl.searchParams.set("feed", "iex");

    const barsData = await fetchJson<BarsResponse>(barsUrl.toString(), authHeaders);
    const snapshots = symbols
      .map((symbol) => buildSnapshot(symbol, barsData.bars?.[symbol] ?? [], bySymbol.get(symbol)))
      .filter((stock): stock is StockSnapshot => Boolean(stock));
    const stocks = snapshots.filter((stock) => stock.changePct >= -5 && stock.changePct <= 25).sort((a, b) => b.volumeRatio - a.volumeRatio).slice(0, 30);
    const debug = new URL(request.url).searchParams.get("debug") === "1";

    return NextResponse.json({
      mode: "live",
      provider: "alpaca",
      scanned: symbols.length,
      stocks,
      timestamp: new Date().toISOString(),
      ...(debug ? { diagnostics: { candidateCount: candidates.length, symbolsRequested: symbols.length, symbolsWithBars: Object.keys(barsData.bars ?? {}).length, snapshotsBuilt: snapshots.length, start, nextPageToken: barsData.next_page_token ?? null } } : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر فحص السوق";
    return NextResponse.json({ mode: "error", error: message, stocks: [] }, { status: 502 });
  }
}
