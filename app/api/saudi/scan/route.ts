import { NextResponse } from "next/server";
import { Bar, macdSignal, rsi, sma, trueRangeAverage } from "@/lib/indicators";
import { scoreMaherHero, StockSnapshot } from "@/lib/maherHero";
import { configuredSaudiSymbols } from "@/lib/saudiSymbols";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type SparkSymbol = {
  symbol?: string;
  timestamp?: number[];
  close?: Array<number | null>;
  open?: Array<number | null>;
  high?: Array<number | null>;
  low?: Array<number | null>;
  volume?: Array<number | null>;
  chartPreviousClose?: number;
  regularMarketPrice?: number;
  regularMarketTime?: number;
};

type SparkResponse = {
  spark?: { result?: SparkSymbol[]; error?: unknown };
};

const YAHOO_SPARK = "https://query1.finance.yahoo.com/v7/finance/spark";

function chunks<T>(items: T[], size: number) {
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size) output.push(items.slice(index, index + size));
  return output;
}

async function fetchBatch(symbols: string[]): Promise<SparkSymbol[]> {
  const url = new URL(YAHOO_SPARK);
  url.searchParams.set("symbols", symbols.map((symbol) => `${symbol}.SR`).join(","));
  url.searchParams.set("range", "5d");
  url.searchParams.set("interval", "5m");
  url.searchParams.set("indicators", "close,open,high,low,volume");
  url.searchParams.set("includeTimestamps", "true");
  url.searchParams.set("includePrePost", "false");

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 Maher-Hero-Scanner/1.0",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Yahoo Finance batch failed (${response.status}): ${details.slice(0, 160)}`);
  }

  const data = (await response.json()) as SparkResponse;
  return data.spark?.result ?? [];
}

function toBars(item: SparkSymbol): Bar[] {
  const timestamps = item.timestamp ?? [];
  const bars: Bar[] = [];
  for (let index = 0; index < timestamps.length; index += 1) {
    const o = item.open?.[index];
    const h = item.high?.[index];
    const l = item.low?.[index];
    const c = item.close?.[index];
    const v = item.volume?.[index];
    if ([o, h, l, c].some((value) => typeof value !== "number" || !Number.isFinite(value))) continue;
    bars.push({
      t: new Date(timestamps[index] * 1000).toISOString(),
      o: o as number,
      h: h as number,
      l: l as number,
      c: c as number,
      v: typeof v === "number" && Number.isFinite(v) ? v : 0,
    });
  }
  return bars;
}

function classifyBreakout(bars: Bar[], changePct: number): StockSnapshot["breakout"] {
  if (changePct >= 12) return "late";
  if (bars.length < 22) return "none";
  const current = bars.at(-1)!;
  const resistance = Math.max(...bars.slice(-21, -1).map((bar) => bar.h));
  const recentLow = Math.min(...bars.slice(-4).map((bar) => bar.l));
  if (current.c > resistance && changePct <= 8) return "early";
  if (recentLow <= resistance * 1.006 && current.c >= resistance && changePct <= 10) return "retest";
  return "none";
}

function buildSnapshot(item: SparkSymbol): StockSnapshot | null {
  const raw = String(item.symbol ?? "").replace(/\.SR$/i, "");
  const bars = toBars(item);
  if (!/^\d{4}$/.test(raw) || bars.length < 35) return null;

  const current = bars.at(-1)!;
  const previous = bars.at(-2)!;
  const price = item.regularMarketPrice ?? current.c;
  if (!price || price <= 0) return null;

  const closes = bars.map((bar) => bar.c);
  const volumes = bars.map((bar) => bar.v);
  const averageVolume = Math.max(1, sma(volumes.slice(0, -1), 20));
  const volumeRatio = current.v / averageVolume;
  const ema20 = sma(closes, 20);
  const trend = current.c > ema20 * 1.004 ? "up" : current.c < ema20 * 0.996 ? "down" : "sideways";
  const priorClose = item.chartPreviousClose ?? previous.c;
  const changePct = priorClose > 0 ? ((price - priorClose) / priorClose) * 100 : 0;
  const resistance = Math.max(...bars.slice(-20, -1).map((bar) => bar.h));
  const resistanceDistancePct = Math.max(0, ((resistance - price) / price) * 100);
  const atr = trueRangeAverage(bars, 14);
  const stopDistancePct = Math.min(7, Math.max(1.2, (atr / price) * 100 * 1.25));

  return {
    symbol: raw,
    name: raw,
    market: "SA",
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

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const requestedLimit = Number(query.get("limit") ?? "120");
  const limit = Math.min(220, Math.max(20, Number.isFinite(requestedLimit) ? requestedLimit : 120));
  const universe = configuredSaudiSymbols().slice(0, limit);
  const batches = chunks(universe, 20);
  const errors: string[] = [];
  const items: SparkSymbol[] = [];

  for (const batch of batches) {
    try {
      items.push(...(await fetchBatch(batch)));
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "تعذر جلب دفعة من البيانات");
    }
  }

  const snapshots = items.map(buildSnapshot).filter((stock): stock is StockSnapshot => Boolean(stock));
  const ranked = snapshots
    .map((stock) => ({ ...stock, ...scoreMaherHero(stock) }))
    .sort((a, b) => b.score - a.score || b.volumeRatio - a.volumeRatio);

  const qualified = ranked.filter((stock) => stock.score >= 95).slice(0, 3);
  const updatedAt = Math.max(0, ...items.map((item) => Number(item.regularMarketTime ?? 0)));

  return NextResponse.json({
    mode: snapshots.length ? "live" : "error",
    provider: "yahoo-finance-unofficial",
    market: "SA",
    requested: universe.length,
    received: items.length,
    scanned: snapshots.length,
    qualified,
    top: ranked.slice(0, 15),
    dataTimestamp: updatedAt ? new Date(updatedAt * 1000).toISOString() : null,
    delayedOrUnofficial: true,
    warning: "البيانات تجريبية ومن مصدر غير رسمي وقد تكون متأخرة. تحقق من السعر في منصة التداول قبل التنفيذ.",
    errors: errors.slice(0, 5),
    timestamp: new Date().toISOString(),
  }, { status: snapshots.length ? 200 : 502 });
}
