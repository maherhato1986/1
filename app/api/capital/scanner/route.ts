import { NextResponse } from "next/server";
import { capitalConfigured, capitalMode, capitalRequest } from "@/lib/capital/client";
import { scanCapitalSymbols } from "@/lib/capital/scanner";
import { scoreMaherHero } from "@/lib/maherHero";
import { MAHER_HERO_WATCHLIST } from "@/lib/maherHeroWatchlist";
import { authorized } from "@/lib/capital/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" };
type AccountsResponse = { accounts?: Array<{ accountId: string; accountName?: string; balance?: { balance?: number; deposit?: number; profitLoss?: number; available?: number } }> };

function universe() {
  const configured = process.env.CAPITAL_SYMBOLS?.split(",").map((item) => item.trim().toUpperCase()).filter(Boolean);
  return configured?.length ? configured.slice(0, 40) : [...MAHER_HERO_WATCHLIST];
}

function tradePlan(price: number, stopPct: number, breakout: string) {
  const entry = breakout === "early" ? price * 1.002 : breakout === "retest" ? price * 0.998 : price;
  const stop = entry * (1 - stopPct / 100);
  const risk = entry - stop;
  return { entry, stop, target1: entry + risk * 2, target2: entry + risk * 3.5, riskReward: 2 };
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors });
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "غير مصرح بالوصول إلى Capital Bot." }, { status: 401, headers: cors });
  if (!capitalConfigured()) {
    return NextResponse.json({ mode: "setup", error: "أضف إعدادات Capital API إلى Vercel.", opportunities: [] }, { headers: cors });
  }
  try {
    const symbols = universe();
    const [stocks, accounts] = await Promise.all([
      scanCapitalSymbols(symbols),
      capitalRequest<AccountsResponse>("/accounts").catch(() => ({ accounts: [] })),
    ]);
    const opportunities = stocks.map((stock) => {
      const hero = scoreMaherHero(stock);
      let score = hero.score;
      const warnings = [...hero.warnings];
      if (stock.marketStatus !== "TRADEABLE") { score = Math.min(score, 59); warnings.push("السوق غير متاح للتداول الآن"); }
      if (stock.spreadPct > 0.8) { score = Math.min(score, 79); warnings.push("السبريد مرتفع"); }
      const plan = tradePlan(stock.price, stock.stopDistancePct, stock.breakout);
      const actionStatus = score >= 90 && ["early", "retest"].includes(stock.breakout) ? "ready" : score >= 80 ? "near" : "watch";
      return { ...stock, ...hero, score, warnings, ...plan, actionStatus, signalExpiresAt: new Date(Date.now() + 5 * 60_000).toISOString() };
    }).sort((a, b) => b.score - a.score || b.volumeRatio - a.volumeRatio).slice(0, 10);
    return NextResponse.json({
      mode: capitalMode(), provider: "capital.com", scanned: symbols.length, analyzed: stocks.length,
      opportunities, account: accounts.accounts?.[0] ?? null, timestamp: new Date().toISOString(), refreshAfterSeconds: 60,
    }, { headers: { ...cors, "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ mode: "error", error: error instanceof Error ? error.message : "تعذر فحص Capital.", opportunities: [] }, { status: 502, headers: cors });
  }
}
