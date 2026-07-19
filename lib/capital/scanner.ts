import { Bar, completedBars, macdSignal, rsi, sma, trueRangeAverage } from "@/lib/indicators";
import { Direction, FrameSignal, StockSnapshot } from "@/lib/maherHero";
import { capitalRequest } from "@/lib/capital/client";

type MarketSearch = { markets?: Array<{ epic: string; symbol?: string; instrumentName?: string; instrumentType?: string; marketStatus?: string; bid?: number; offer?: number }> };
type MarketSummary = {
  epic: string; symbol?: string; instrumentName?: string; instrumentType?: string;
  marketStatus?: string; bid?: number; offer?: number; percentageChange?: number;
  streamingPricesAvailable?: boolean;
};
type MarketNode = { id: string; name?: string };
type MarketNavigation = { nodes?: MarketNode[]; markets?: MarketSummary[] };
type PriceResponse = { prices?: Array<{ snapshotTimeUTC: string; openPrice: { bid: number; ask: number }; highPrice: { bid: number; ask: number }; lowPrice: { bid: number; ask: number }; closePrice: { bid: number; ask: number }; lastTradedVolume?: number }> };

export type CapitalAssetClass = "shares" | "saudi" | "crypto" | "forex" | "indices" | "commodities";
export type CapitalCandidate = StockSnapshot & { epic: string; spreadPct: number; marketStatus: string; assetClass: CapitalAssetClass };

const instrumentTypes: Record<Exclude<CapitalAssetClass, "saudi">, string> = {
  shares: "SHARES",
  crypto: "CRYPTOCURRENCIES",
  forex: "CURRENCIES",
  indices: "INDICES",
  commodities: "COMMODITIES",
};

const spreadLimits: Record<CapitalAssetClass, number> = {
  shares: 1.5,
  saudi: 2.2,
  crypto: 3,
  forex: 0.6,
  indices: 1.2,
  commodities: 1.8,
};

const epicCache = new Map<string, { epic: string; name: string; status: string; spreadPct: number }>();
const discoveryCache = new Map<CapitalAssetClass, { expiresAt: number; symbols: string[]; totalMarkets: number }>();
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
  const momentum = change >= 1 && change <= 20 ? 100 + change * 2 : Math.max(0, 45 - Math.abs(change - 4) * 2);
  const live = item.marketStatus === "TRADEABLE" ? 15 : 0;
  const streaming = item.streamingPricesAvailable === false ? -20 : 5;
  return momentum + live + streaming - spread * 12;
}

function validMarket(item: MarketSummary, assetClass: CapitalAssetClass) {
  if (!item.epic || !["TRADEABLE", "CLOSED"].includes(item.marketStatus ?? "")) return false;
  const middle = item.bid && item.offer ? (item.bid + item.offer) / 2 : 0;
  if (!(middle > 0) || marketSpread(item) > spreadLimits[assetClass]) return false;
  if (["shares", "saudi"].includes(assetClass) && (middle < 0.05 || middle > 1500)) return false;
  return true;
}

function isSaudiName(value: string | undefined) {
  return /saudi|السعود/i.test(String(value ?? ""));
}

async function discoverSaudiMarkets() {
  const root = await capitalRequest<MarketNavigation>("/marketnavigation");
  const queue = (root.nodes ?? []).map((node) => ({ node, depth: 0, saudiBranch: isSaudiName(node.name) }));
  const visited = new Set<string>();
  const collected: MarketSummary[] = [];
  let requests = 0;

  while (queue.length && requests < 45) {
    const current = queue.shift()!;
    if (!current.node.id || visited.has(current.node.id) || current.depth > 4) continue;
    visited.add(current.node.id);
    requests += 1;
    const response = await capitalRequest<MarketNavigation>(`/marketnavigation/${encodeURIComponent(current.node.id)}`);
    const branch = current.saudiBranch || isSaudiName(current.node.name);
    if (branch) collected.push(...(response.markets ?? []));
    for (const child of response.nodes ?? []) {
      const childBranch = branch || isSaudiName(child.name);
      const usefulParent = /popular|shares|stocks|countries|regions|asia|middle east|الأسهم|الدول|آسيا|الشرق/i.test(String(current.node.name ?? ""));
      if (childBranch || usefulParent || current.depth < 2) queue.push({ node: child, depth: current.depth + 1, saudiBranch: childBranch });
    }
  }

  if (!collected.length) {
    const searched = await capitalRequest<MarketSearch>("/markets?searchTerm=Saudi");
    collected.push(...(searched.markets ?? []));
  }

  const unique = new Map<string, MarketSummary>();
  for (const item of collected) {
    if (item.instrumentType === "SHARES" && validMarket(item, "saudi")) unique.set(item.epic, item);
  }
  return Array.from(unique.values());
}

/** Discover the strongest instruments directly from Capital for the selected asset class. */
export async function discoverCapitalUniverse(limit = 40, assetClass: CapitalAssetClass = "shares") {
  const cached = discoveryCache.get(assetClass);
  if (cached && cached.expiresAt > Date.now()) return cached;

  let markets: MarketSummary[];
  if (assetClass === "saudi") {
    markets = await discoverSaudiMarkets();
  } else {
    const response = await capitalRequest<{ markets?: MarketSummary[] }>("/markets");
    const expectedType = instrumentTypes[assetClass];
    markets = (response.markets ?? []).filter((item) => item.instrumentType === expectedType && validMarket(item, assetClass));
  }

  const selected = markets.sort((a, b) => discoveryScore(b) - discoveryScore(a)).slice(0, limit);
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
  const result = { expiresAt: Date.now() + 5 * 60_000, symbols: selected.map((item) => item.epic.toUpperCase()), totalMarkets: markets.length };
  discoveryCache.set(assetClass, result);
  return result;
}

function snapshot(symbol: string, name: string, epic: string, status: string, spreadPct: number, assetClass: CapitalAssetClass, raw5: Bar[], rawDay: Bar[]): CapitalCandidate | null {
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
    symbol, name, epic, marketStatus: status, spreadPct, assetClass, market: assetClass === "saudi" ? "SA" : "US", price, changePct,
    sessionGainPct: changePct, pullbackFromHighPct: high ? (high - price) / high * 100 : 0,
    volumeRatio, rsi: frames.m5.rsi, macdSignal: frames.m5.macdSignal, trend: frames.m5.trend,
    breakout, resistanceDistancePct: Math.max(0, (nextResistance - price) / price * 100),
    stopDistancePct: Math.min(7, Math.max(1.2, atr / price * 100 * 1.25)), frames,
  };
}

export async function scanCapitalSymbols(symbols: string[], assetClass: CapitalAssetClass = "shares") {
  const candidates: CapitalCandidate[] = [];
  const diagnostics: Array<{ symbol: string; stage: string; error: string }> = [];
  const scanOne = async (symbol: string) => {
    try {
      const market = await resolveEpic(symbol);
      if (!market) { diagnostics.push({ symbol, stage: "resolve", error: "لم يُعثر على رمز مطابق في Capital" }); return; }
      const [daily, five] = await Promise.all([
        capitalRequest<PriceResponse>(`/prices/${encodeURIComponent(market.epic)}?resolution=DAY&max=420`),
        capitalRequest<PriceResponse>(`/prices/${encodeURIComponent(market.epic)}?resolution=MINUTE_5&max=1000`),
      ]);
      const built = snapshot(symbol, market.name, market.epic, market.status, market.spreadPct, assetClass, bars(five), bars(daily));
      if (built) candidates.push(built);
      else diagnostics.push({ symbol, stage: "bars", error: `بيانات غير كافية: يومي ${daily.prices?.length ?? 0}، 5 دقائق ${five.prices?.length ?? 0}` });
    } catch (error) {
      diagnostics.push({ symbol, stage: "api", error: error instanceof Error ? error.message : "خطأ غير معروف" });
    }
  };
  for (let index = 0; index < symbols.length; index += 4) {
    await Promise.all(symbols.slice(index, index + 4).map(scanOne));
    if (index + 4 < symbols.length) await wait(1100);
  }
  return { candidates, diagnostics };
}
