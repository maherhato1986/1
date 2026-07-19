import { NextResponse } from "next/server";
import { capitalConfigured, capitalMode, capitalRequest } from "@/lib/capital/client";
import { CapitalAssetClass, discoverCapitalUniverse, scanCapitalSymbols } from "@/lib/capital/scanner";
import { scoreMaherHero } from "@/lib/maherHero";
import { MAHER_HERO_WATCHLIST } from "@/lib/maherHeroWatchlist";
import { authorized } from "@/lib/capital/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" };
type AccountsResponse = { accounts?: Array<{ accountId: string; accountName?: string; currency?: string; balance?: { balance?: number; deposit?: number; profitLoss?: number; available?: number } }> };

const allowedAssetClasses = new Set<CapitalAssetClass>(["shares", "crypto", "forex", "indices", "commodities"]);
const assetLabels: Record<CapitalAssetClass, string> = { shares: "الأسهم الأمريكية", crypto: "العملات الرقمية", forex: "الفوركس", indices: "المؤشرات", commodities: "السلع" };

function envEnabled(value: string | undefined) {
  return ["true", "1", "yes", "on"].includes(String(value ?? "").trim().toLowerCase());
}

function fallbackUniverse() {
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
    return NextResponse.json({ mode: "setup", tradingEnabled: false, error: "أضف إعدادات Capital API إلى Vercel.", opportunities: [] }, { headers: cors });
  }
  try {
    const requested = new URL(request.url).searchParams.get("market") as CapitalAssetClass | null;
    const assetClass: CapitalAssetClass = requested && allowedAssetClasses.has(requested) ? requested : "shares";
    let source: "capital-market" | "configured-fallback" = "capital-market";
    let marketUniverse = 0;
    let symbols: string[];
    try {
      const discovered = await discoverCapitalUniverse(40, assetClass);
      symbols = discovered.symbols;
      marketUniverse = discovered.totalMarkets;
      if (!symbols.length) throw new Error(`لم يعثر Capital على أدوات قابلة للفحص ضمن ${assetLabels[assetClass]}`);
    } catch (error) {
      if (assetClass !== "shares") throw error;
      source = "configured-fallback";
      symbols = fallbackUniverse();
    }
    const [scan, accounts] = await Promise.all([
      scanCapitalSymbols(symbols, assetClass),
      capitalRequest<AccountsResponse>("/accounts").catch(() => ({ accounts: [] })),
    ]);
    const stocks = scan.candidates;
    const opportunities = stocks.map((stock) => {
      const hero = scoreMaherHero(stock);
      const rawScore = hero.score;
      let score = rawScore;
      const warnings = [...hero.warnings];
      const marketOpen = stock.marketStatus === "TRADEABLE";
      if (!marketOpen) { score = Math.min(score, 59); warnings.push("السوق غير متاح للتداول الآن"); }
      if (stock.spreadPct > 0.8) { score = Math.min(score, 79); warnings.push("السبريد مرتفع"); }
      const plan = tradePlan(stock.price, stock.stopDistancePct, stock.breakout);
      const actionStatus = marketOpen && score >= 90 && ["early", "retest"].includes(stock.breakout) ? "ready" : rawScore >= 80 ? "near" : "watch";
      return { ...stock, ...hero, rawScore, score, warnings, ...plan, actionStatus, marketOpen, signalExpiresAt: new Date(Date.now() + 5 * 60_000).toISOString() };
    }).sort((a, b) => b.rawScore - a.rawScore || b.volumeRatio - a.volumeRatio).slice(0, 10);
    const diagnostic = scan.diagnostics[0];
    return NextResponse.json({
      mode: capitalMode(), tradingEnabled: envEnabled(process.env.CAPITAL_TRADING_ENABLED), provider: "capital.com", source,
      assetClass, assetLabel: assetLabels[assetClass], marketUniverse, prefiltered: symbols.length,
      scanned: symbols.length, analyzed: stocks.length,
      opportunities, account: accounts.accounts?.[0] ?? null, timestamp: new Date().toISOString(), refreshAfterSeconds: 60,
      error: stocks.length ? undefined : diagnostic ? `${diagnostic.symbol}: ${diagnostic.error}` : `لم تتوفر بيانات لتحليل ${assetLabels[assetClass]}.`,
      diagnostics: scan.diagnostics.slice(0, 12),
    }, { headers: { ...cors, "Cache-Control": "no-store, no-cache, must-revalidate" } });
  } catch (error) {
    return NextResponse.json({ mode: "error", tradingEnabled: false, error: error instanceof Error ? error.message : "تعذر فحص Capital.", opportunities: [] }, { status: 502, headers: cors });
  }
}
