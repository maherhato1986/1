import { NextResponse } from "next/server";
import { Bar, macdSignal, rsi, sma, trueRangeAverage } from "@/lib/indicators";
import { StockSnapshot } from "@/lib/maherHero";

type ScreenerItem = {
  symbol: string;
  percent_change?: number;
  change?: number;
  price?: number;
  volume?: number;
  trade?: { p?: number };
};

type BarsResponse = {
  bars?: Record<string, Bar[]>;
  next_page_token?: string | null;
};

const baseUrl = "https://data.alpaca.markets";

function headers() {
  const key = process.env.ALPACA_API_KEY;
  const secret = process.env.ALPACA_API_SECRET;
  if (!key || !secret) return null;
  return {
    "APCA-API-KEY-ID": key,
    "APCA-API-SECRET-KEY": secret,
  };
}

async function fetchJson<T>(url: string, authHeaders: Record<string, string>): Promise<T> {
  const response = await fetch(url, {
    headers: authHeaders,
    cache: "no-store",
  });
  if (!response.ok) {
    const details = await response.text();
    throw new Error(`تعذر جلب بيانات السوق (${response.status}): ${details.slice(0, 180)}`);
  }
  return response.json() as Promise<T>;
}

function classifyBreakout(bars: Bar[], changePct: number): StockSnapshot["breakout"] {
  if (changePct >= 12) return "late";
  if (bars.length < 12) return "none";
  const current = bars.at(-1)!;
  const prior = bars.slice(-12, -1);
  const resistance = Math.max(...prior.map((bar) => bar.h));
  const recentLow = Math.min(...bars.slice(-4).map((bar) => bar.l));
  if (current.c > resistance && changePct <= 8) return "early";
  if (recentLow <= resistance * 1.006 && current.c >= resistance && changePct <= 10) return "retest";
  return "none";
}

function buildSnapshot(symbol: string, bars: Bar[], screener?: ScreenerItem): StockSnapshot | null {
  if (bars.length < 20) return null;
  const closes = bars.map((bar) => bar.c);
  const volumes = bars.map((bar) => bar.v);
  const current = bars.at(-1)!;
  const previous = bars.at(-2)!;
  const price = screener?.trade?.p ?? screener?.price ?? current.c;
  if (!price || price < 1) return null;

  const changePct = screener?.percent_change ?? ((current.c - previous.c) / previous.c) * 100;
  const averageVolume = Math.max(1, sma(volumes.slice(0, -1), 20));
  const volumeRatio = current.v / averageVolume;
  const ema20 = sma(closes, 20);
  const trend = current.c > ema20 * 1.004 ? "up" : current.c < ema20 * 0.996 ? "down" : "sideways";
  const priorHighs = bars.slice(-20, -1).map((bar) => bar.h);
  const resistance = Math.max(...priorHighs);
  const resistanceDistancePct = Math.max(0, ((resistance - price) / price) * 100);
  const atr = trueRangeAverage(bars, 14);
  const stopDistancePct = Math.min(7, Math.max(1.2, (atr / price) * 100 * 1.25));

  return {
    symbol,
    name: symbol,
    market: "US",
    price,
    changePct,
    volumeRatio,
    rsi: rsi(closes, 14),
    macdSignal: macdSignal(closes),
    trend,
    breakout: classifyBreakout(bars, changePct),
    resistanceDistancePct,
    stopDistancePct,
  };
}

export async function GET() {
  const authHeaders = headers();
  if (!authHeaders) {
    return NextResponse.json({
      mode: "demo",
      error: "أضف ALPACA_API_KEY وALPACA_API_SECRET في Vercel لتفعيل بيانات السوق الحقيقي.",
      stocks: [],
    });
  }

  try {
    const [movers, actives] = await Promise.all([
      fetchJson<{ gainers?: ScreenerItem[] }>(`${baseUrl}/v1beta1/screener/stocks/movers?top=30`, authHeaders),
      fetchJson<{ most_actives?: ScreenerItem[] }>(`${baseUrl}/v1beta1/screener/stocks/most-actives?top=30&by=volume`, authHeaders),
    ]);

    const candidates = [...(movers.gainers ?? []), ...(actives.most_actives ?? [])];
    const bySymbol = new Map<string, ScreenerItem>();
    for (const item of candidates) {
      if (item.symbol && !bySymbol.has(item.symbol)) bySymbol.set(item.symbol, item);
    }
    const symbols = Array.from(bySymbol.keys()).slice(0, 40);
    if (!symbols.length) throw new Error("لم يرجع مزود السوق أسهمًا مرشحة حاليًا.");

    const start = new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString();
    const barsUrl = new URL(`${baseUrl}/v2/stocks/bars`);
    barsUrl.searchParams.set("symbols", symbols.join(","));
    barsUrl.searchParams.set("timeframe", "5Min");
    barsUrl.searchParams.set("start", start);
    barsUrl.searchParams.set("limit", "10000");
    barsUrl.searchParams.set("adjustment", "raw");
    barsUrl.searchParams.set("feed", "iex");

    const barsData = await fetchJson<BarsResponse>(barsUrl.toString(), authHeaders);
    const stocks = symbols
      .map((symbol) => buildSnapshot(symbol, barsData.bars?.[symbol] ?? [], bySymbol.get(symbol)))
      .filter((stock): stock is StockSnapshot => Boolean(stock))
      .filter((stock) => stock.volumeRatio >= 0.8 && stock.changePct > -3)
      .slice(0, 30);

    return NextResponse.json({
      mode: "live",
      provider: "alpaca",
      scanned: symbols.length,
      stocks,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر فحص السوق";
    return NextResponse.json({ mode: "error", error: message, stocks: [] }, { status: 502 });
  }
}
