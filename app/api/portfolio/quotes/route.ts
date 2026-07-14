import { NextResponse } from "next/server";
import { z } from "zod";
import { Bar, completedBars, macdSignal, rsi, sma, trueRangeAverage } from "@/lib/indicators";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({ symbols: z.array(z.string().min(1).max(10)).min(1).max(50) });
const baseUrl = "https://data.alpaca.markets";

type Snapshot = {
  latestTrade?: { p?: number };
  dailyBar?: Bar;
  prevDailyBar?: Bar;
  minuteBar?: Bar;
};

type BarsResponse = { bars?: Record<string, Bar[]> };

function authHeaders() {
  const key = process.env.ALPACA_API_KEY;
  const secret = process.env.ALPACA_API_SECRET;
  if (!key || !secret) return null;
  return { "APCA-API-KEY-ID": key, "APCA-API-SECRET-KEY": secret };
}

async function fetchJson<T>(url: string, headers: Record<string, string>): Promise<T> {
  const response = await fetch(url, { headers, cache: "no-store", signal: AbortSignal.timeout(18_000) });
  if (!response.ok) throw new Error(`تعذر جلب أسعار المحفظة (${response.status})`);
  return response.json() as Promise<T>;
}

function nearestResistance(bars: Bar[], price: number) {
  const highs = bars.slice(0, -3).map((bar) => bar.h).filter((high) => high > price * 1.002);
  return highs.length ? Math.min(...highs) : price * 1.06;
}

function nearestSupport(bars: Bar[], price: number) {
  const lows = bars.slice(-30).map((bar) => bar.l).filter((low) => low < price * 0.998);
  return lows.length ? Math.max(...lows) : price * 0.94;
}

export async function POST(request: Request) {
  const headers = authHeaders();
  if (!headers) return NextResponse.json({ error: "بيانات Alpaca غير مفعلة." }, { status: 503 });

  try {
    const { symbols } = schema.parse(await request.json());
    const normalized = Array.from(new Set(symbols.map((s) => s.trim().toUpperCase())));
    const joined = normalized.join(",");
    const start = new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString();

    const snapshotsUrl = new URL(`${baseUrl}/v2/stocks/snapshots`);
    snapshotsUrl.searchParams.set("symbols", joined);
    snapshotsUrl.searchParams.set("feed", "iex");

    const barsUrl = new URL(`${baseUrl}/v2/stocks/bars`);
    barsUrl.searchParams.set("symbols", joined);
    barsUrl.searchParams.set("timeframe", "5Min");
    barsUrl.searchParams.set("start", start);
    barsUrl.searchParams.set("limit", "10000");
    barsUrl.searchParams.set("adjustment", "raw");
    barsUrl.searchParams.set("feed", "iex");

    const [snapshots, barsData] = await Promise.all([
      fetchJson<Record<string, Snapshot>>(snapshotsUrl.toString(), headers),
      fetchJson<BarsResponse>(barsUrl.toString(), headers),
    ]);

    const quotes = normalized.map((symbol) => {
      const snapshot = snapshots[symbol] || {};
      const bars = completedBars(barsData.bars?.[symbol] || [], 5);
      const currentBar = bars.at(-1) || snapshot.minuteBar || snapshot.dailyBar;
      const price = snapshot.latestTrade?.p || currentBar?.c || snapshot.dailyBar?.c || 0;
      if (!price) return { symbol, error: "لا يوجد سعر متاح" };

      const closes = bars.map((bar) => bar.c);
      const volumes = bars.map((bar) => bar.v);
      const currentRsi = closes.length >= 15 ? rsi(closes, 14) : 50;
      const macd = closes.length >= 35 ? macdSignal(closes) : "neutral";
      const avgVolume = volumes.length >= 20 ? Math.max(1, sma(volumes.slice(-21, -1), 20)) : 1;
      const volumeRatio = currentBar ? currentBar.v / avgVolume : 1;
      const resistance = bars.length >= 10 ? nearestResistance(bars, price) : price * 1.06;
      const support = bars.length >= 10 ? nearestSupport(bars, price) : price * 0.94;
      const atr = bars.length >= 15 ? trueRangeAverage(bars, 14) : price * 0.03;
      const prevClose = snapshot.prevDailyBar?.c || bars.at(-2)?.c || price;
      const changePct = prevClose ? ((price - prevClose) / prevClose) * 100 : 0;
      const recentHigh = bars.length ? Math.max(...bars.slice(-18).map((bar) => bar.h)) : price;
      const pullbackPct = recentHigh ? ((recentHigh - price) / recentHigh) * 100 : 0;

      let signal: "hold" | "near_target" | "partial_sell" | "exit" | "danger" = "hold";
      const reasons: string[] = [];
      if (price <= support * 0.995 && macd === "bearish") {
        signal = "danger";
        reasons.push("كسر دعم مع زخم سلبي");
      } else if (currentRsi >= 74 && macd === "bearish") {
        signal = "exit";
        reasons.push("تشبع شرائي مع انعكاس MACD");
      } else if (price >= resistance * 0.995 && (currentRsi >= 68 || pullbackPct >= 2.5)) {
        signal = "partial_sell";
        reasons.push("وصول للمقاومة مع احتمال جني أرباح");
      } else if (price >= resistance * 0.98) {
        signal = "near_target";
        reasons.push("قريب من المقاومة التالية");
      } else {
        reasons.push(macd === "bullish" ? "الزخم ما زال إيجابيًا" : "السهم يحتاج مراقبة الزخم");
      }

      return {
        symbol,
        price,
        changePct,
        rsi: currentRsi,
        macdSignal: macd,
        volumeRatio,
        resistance,
        support,
        atr,
        signal,
        reasons,
        updatedAt: new Date().toISOString(),
      };
    });

    return NextResponse.json({ provider: "alpaca", quotes, timestamp: new Date().toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر تحديث المحفظة";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
