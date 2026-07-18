import { Bar, completedBars, macdSignal, rsi, sma, trueRangeAverage } from "@/lib/indicators";
import { Direction, FrameSignal, StockSnapshot } from "@/lib/maherHero";
import { capitalRequest } from "@/lib/capital/client";

type MarketSearch = { markets?: Array<{ epic: string; symbol?: string; instrumentName?: string; marketStatus?: string; bid?: number; offer?: number }> };
type MarketSummary = {
  epic: string; symbol?: string; instrumentName?: string; instrumentType?: string;
  marketStatus?: string; bid?: number; offer?: number; percentageChange?: number;
  streamingPricesAvailable?: boolean;
};
type PriceResponse = { prices?: Array<{ snapshotTimeUTC: string; openPrice: { bid: number; ask: number }; highPrice: { bid: number; ask: number }; lowPrice: { bid: number; ask: number }; closePrice: { bid: number; ask: number }; lastTradedVolume?: number }> };

export type CapitalCandidate = StockSnapshot & { epic: string; spreadPct: number; marketStatus: string };

const epicCache = new Map<string, { epic: string; name: string; status: string; spreadPct: number }>();
let discoveryCache: { expiresAt: number; symbols: string[]; totalShares: number } | null = null;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const mid = (price: { bid: number; ask: number }) => (price.bid + price.ask) / 2;

function bars(data: PriceResponse): Bar[] {
  return (data.prices ?? []).map((item) => ({
    t: item.snapshotTimeUTC,
    o: mid(item.openPrice), h: mid(item.highPrice), l: mid(item.lowPrice), c: mid(item.closePrice),
    v: Math.max(0, item.lastTradedVolume ?? 0),
  }));
}

function aggregate(input: Bar[], size: number): Bar[] {
  const result: Bar[] = [];
  for (let index = 0; index < input.length; index += size) {
    const group = input.slice(index, index + size);
    if (group.length < size) continue;
    result.push({ t: group[0].t, o: group[0].o, h: Math.max(...group.map((x) => x.h)), l: Math.min(...group.map((x) => x.l)), c: group.at(-1)!.c, v: group.reduce((sum, x) => sum + x.v, 0) });
  }
  return result;
}

function direction(closes: number[], period = 20): Direction {
  if (closes.length < period + 2) return "sideways";
  const average = sma(closes, period), last = closes.at(-1)!;
  return last > average * 1.008 ? "up" : last < average * 0.992 ? "down" : "sideways";
}

function frame(input: Bar[], period = 20): FrameSignal {
  const closes = input.map((x) => x.c);
  return { trend: direction(closes, period), rsi: rsi(closes), macdSignal: macdSignal(closes) };
}

function weekly(input: Bar[]): FrameSignal {
  return frame(aggregate(input, 5), 10);
}

async function resolveEpic(symbol: string) {
  const cached = epicCache.get(symbol);
  if (cached) return cached;
  const response = await capitalRequest<MarketSearch>(`/markets?searchTerm=${encodeURIComponent(symbol)}`);
  const exact = (response.markets ?? []).find((item) => item.symbol?.toUpperCase() === symbol || item.epic.toUpperCase() === symbol)
    ?? (response.markets ?? []).find((item) => item.epic.toUpperCase().includes(symbol));
  if (!exact) return null;
  const middle = exact.bid && exact.offer ? (exact.bid + exact.offer) / 2 : 0;
  const resolved = { epic: exact.epic, name: exact.instrumentName ?? symbol, status: exact.marketStatus ?? "UNKNOWN", spreadPct: middle ? Math.abs(exact.offer! - exact.bid!) / middle * 100 : 0 };
  epicCache.set(symbol, resolved);
  return resolved;
}

function marketSpread(item: MarketSummary) {
  const middle = item.bid && item.offer ? (item.bid + item.offer) / 2 : 0;
  return middle ? Math.abs(item.offer! - item.bid!) / middle * 100 : 999;
}

function discoveryScore(item: MarketSummary) {
  const change = Number(item.percentageChange ?? 0);
  const spread = marketSpread(item);
  const momentum = change >= 2 && change <= 20 ? 100 + change * 2 : Math.max(0, 40 - Math.abs(change - 5) * 2);
  const live = item.marketStatus === "TRADEABLE" ? 15 : 0;
  const streaming = item.streamingPricesAvailable === false ? -20 : 5;
  return momentum + live + streaming - spread * 12;
}

/** Discover the strongest share CFDs directly from Capital instead of a fixed watchlist. */
export async function discoverCapitalUniverse(limit = 40) {
  if (discoveryCache && discoveryCache.expiresAt > Date.now()) return discoveryCache;
  const response = await capitalRequest<{ markets?: MarketSummary[] }>("/markets");
  const shares = (response.markets ?? []).filter((item) => {
    if (item.instrumentType !== "SHARES" || !item.epic) return false;
    if (!["TRADEABLE", "CLOSED"].includes(item.marketStatus ?? "")) return false;
    const middle = item.bid && item.offer ? (item.bid + item.offer) / 2 : 0;
    return middle >= 0.25 && middle <= 1500 && marketSpread(item) <= 1.5;
  });
  const selected = shares.sort((a, b) => discoveryScore(b) - discoveryScore(a)).slice(0, limit);
  for (const item of selected) {
    const resolved = {
      epic: item.epic,
      name: item.instrumentName ?? item.symbol ?? item.epic,
      status: item.marketStatus ?? "UNKNOWN",
      spreadPct: marketSpread(item),
    };
    epicCache.set(item.epic.toUpperCase(), resolved);
    if (item.symbol) epicCache.set(item.symbol.toUpperCase(), resolved);
  }
  discoveryCache = { expiresAt: Date.now() + 5 * 60_000, symbols: selected.map((item) => item.epic.toUpperCase()), totalShares: shares.length };
  return discoveryCache;
}

function snapshot(symbol: string, name: string, epic: string, status: string, spreadPct: number, raw5: Bar[], rawDay: Bar[]): CapitalCandidate | null {
  const m5 = completedBars(raw5, 5), daily = completedBars(rawDay, 1440);
  if (m5.length < 40 || daily.length < 35) return null;
  const price = m5.at(-1)!.c, previousClose = daily.at(-2)?.c ?? daily.at(-1)!.o;
  const changePct = previousClose ? (price - previousClose) / previousClose * 100 : 0;
  const volumes = m5.map((x) => x.v), currentVolume = volumes.at(-1) ?? 0;
  const averageVolume = Math.max(1, sma(volumes.slice(-21, -1), 20));
  const volumeRatio = currentVolume > 0 ? currentVolume / averageVolume : 1;
  const atr = trueRangeAverage(m5, 14);
  const prior = m5.slice(-21, -1), resistance = Math.max(...prior.map((x) => x.h));
  const recentLow = Math.min(...m5.slice(-4).map((x) => x.l));
  let breakout: StockSnapshot["breakout"] = "none";
  if (changePct >= 25) breakout = "late";
  else if (price > resistance && changePct <= 12) breakout = "early";
  else if (recentLow <= resistance * 1.006 && price >= resistance && changePct <= 15) breakout = "retest";
  const oldHighs = m5.slice(0, -21).map((x) => x.h).filter((x) => x > price * 1.005);
  const nextResistance = oldHighs.length ? Math.min(...oldHighs) : price + Math.max(atr * 3, price * 0.05);
  const frames = { weekly: weekly(daily), daily: frame(daily), hourly: frame(aggregate(m5, 12)), m15: frame(aggregate(m5, 3)), m5: frame(m5) };
  const high = Math.max(...m5.slice(-78).map((x) => x.h));
  return {
    symbol, name, epic, marketStatus: status, spreadPct, market: "US", price, changePct,
    sessionGainPct: changePct, pullbackFromHighPct: high ? (high - price) / high * 100 : 0,
    volumeRatio, rsi: frames.m5.rsi, macdSignal: frames.m5.macdSignal, trend: frames.m5.trend,
    breakout, resistanceDistancePct: Math.max(0, (nextResistance - price) / price * 100),
    stopDistancePct: Math.min(7, Math.max(1.2, atr / price * 100 * 1.25)), frames,
  };
}

export async function scanCapitalSymbols(symbols: string[]) {
  const candidates: CapitalCandidate[] = [];
  const diagnostics: Array<{ symbol: string; stage: string; error: string }> = [];
  for (const symbol of symbols) {
    try {
      const market = await resolveEpic(symbol);
      if (!market) { diagnostics.push({ symbol, stage: "resolve", error: "لم يُعثر على رمز مطابق في Capital" }); continue; }
      await wait(115);
      const daily = await capitalRequest<PriceResponse>(`/prices/${encodeURIComponent(market.epic)}?resolution=DAY&max=420`);
      await wait(115);
      const five = await capitalRequest<PriceResponse>(`/prices/${encodeURIComponent(market.epic)}?resolution=MINUTE_5&max=1000`);
      const built = snapshot(symbol, market.name, market.epic, market.status, market.spreadPct, bars(five), bars(daily));
      if (built) candidates.push(built);
      else diagnostics.push({ symbol, stage: "bars", error: `بيانات غير كافية: يومي ${daily.prices?.length ?? 0}، 5 دقائق ${five.prices?.length ?? 0}` });
    } catch (error) {
      // One unavailable instrument must not stop the full scan.
      diagnostics.push({ symbol, stage: "api", error: error instanceof Error ? error.message : "خطأ غير معروف" });
    }
  }
  return { candidates, diagnostics };
}
