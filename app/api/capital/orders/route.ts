import { NextResponse } from "next/server";
import { z } from "zod";
import { capitalMode, capitalRequest } from "@/lib/capital/client";
import { authorized } from "@/lib/capital/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" };
const orderSchema = z.object({
  action: z.enum(["preview", "execute"]).default("preview"),
  epic: z.string().min(1).max(80), symbol: z.string().min(1).max(40),
  direction: z.enum(["BUY", "SELL"]).default("BUY"),
  type: z.enum(["MARKET", "LIMIT", "STOP"]).default("STOP"),
  size: z.number().positive().max(100_000_000), entry: z.number().positive(), stop: z.number().positive(), target: z.number().positive(),
  score: z.number().min(0).max(100), confirmation: z.string().optional(),
});

type MarketDetails = {
  instrument?: {
    epic?: string;
    name?: string;
    type?: string;
    currency?: string;
    lotSize?: number;
    marginFactor?: number;
    marginFactorUnit?: string;
  };
  dealingRules?: {
    minDealSize?: { value?: number };
    maxDealSize?: { value?: number };
    minSizeIncrement?: { value?: number };
  };
  snapshot?: { marketStatus?: string; bid?: number; offer?: number };
};

type MarketSearch = {
  markets?: Array<{
    epic?: string;
    symbol?: string;
    instrumentName?: string;
    bid?: number;
    offer?: number;
  }>;
};

type AccountsResponse = {
  accounts?: Array<{
    preferred?: boolean;
    currency?: string;
    balance?: { balance?: number; deposit?: number; profitLoss?: number; available?: number };
  }>;
};

type AccountPreferences = {
  leverages?: Record<string, { current?: number; available?: number[] }>;
};

type DealConfirmation = {
  dealStatus?: string;
  status?: string;
  reason?: string;
  dealId?: string;
  affectedDeals?: Array<{ dealId?: string; status?: string }>;
};

function envEnabled(value: string | undefined) {
  return ["true", "1", "yes", "on"].includes(String(value ?? "").trim().toLowerCase());
}

function normalizeCurrency(value: string | undefined) {
  return String(value ?? "").trim().toUpperCase();
}

function marketMid(item: { bid?: number; offer?: number }) {
  const bid = Number(item.bid ?? 0);
  const offer = Number(item.offer ?? 0);
  return bid > 0 && offer > 0 ? (bid + offer) / 2 : 0;
}

async function currencyRate(fromCurrency: string, toCurrency: string) {
  const from = normalizeCurrency(fromCurrency);
  const to = normalizeCurrency(toCurrency);
  if (!from || !to || from === to) return { rate: 1, pair: `${from}/${to}`, inverse: false };

  const directLabel = `${from}/${to}`;
  const inverseLabel = `${to}/${from}`;
  const searches = [directLabel, `${from}${to}`, inverseLabel, `${to}${from}`];

  for (const searchTerm of searches) {
    const response = await capitalRequest<MarketSearch>(`/markets?searchTerm=${encodeURIComponent(searchTerm)}`).catch(() => ({ markets: [] }));
    for (const item of response.markets ?? []) {
      const label = `${item.symbol ?? ""} ${item.instrumentName ?? ""} ${item.epic ?? ""}`.toUpperCase().replace(/[^A-Z]/g, "");
      const mid = marketMid(item);
      if (!(mid > 0)) continue;
      if (label.includes(`${from}${to}`)) return { rate: mid, pair: directLabel, inverse: false };
      if (label.includes(`${to}${from}`)) return { rate: 1 / mid, pair: inverseLabel, inverse: true };
    }
  }

  return { rate: null as number | null, pair: directLabel, inverse: false };
}

function confirmationAccepted(confirmation: DealConfirmation) {
  const dealStatus = String(confirmation.dealStatus ?? "").toUpperCase();
  const status = String(confirmation.status ?? "").toUpperCase();
  if (dealStatus === "REJECTED" || status === "REJECTED" || status === "DELETED") return false;
  return dealStatus === "ACCEPTED" || ["OPEN", "OPENED", "PENDING", "AMENDED"].includes(status) || Boolean(confirmation.dealId);
}

function normalizedInstrumentType(value: string | undefined) {
  const type = String(value ?? "").trim().toUpperCase();
  if (type === "CURRENCY" || type === "FOREX") return "CURRENCIES";
  if (type === "CRYPTOCURRENCY" || type === "CRYPTO") return "CRYPTOCURRENCIES";
  if (type === "COMMODITY") return "COMMODITIES";
  if (type === "INDEX") return "INDICES";
  if (type === "SHARE" || type === "STOCK") return "SHARES";
  return type;
}

export function OPTIONS() { return new NextResponse(null, { status: 204, headers: cors }); }

export async function POST(request: Request) {
  try {
    if (!authorized(request)) return NextResponse.json({ error: "غير مصرح بالوصول إلى Capital Bot." }, { status: 401, headers: cors });
    const input = orderSchema.parse(await request.json());

    const [market, accounts, preferences] = await Promise.all([
      capitalRequest<MarketDetails>(`/markets/${encodeURIComponent(input.epic)}`),
      capitalRequest<AccountsResponse>("/accounts"),
      capitalRequest<AccountPreferences>("/accounts/preferences").catch(() => ({ leverages: {} })),
    ]);

    const account = accounts.accounts?.find((item) => item.preferred) ?? accounts.accounts?.[0];
    const accountCurrency = normalizeCurrency(account?.currency) || "USD";
    const instrumentCurrency = normalizeCurrency(market.instrument?.currency) || accountCurrency;
    const conversion = await currencyRate(instrumentCurrency, accountCurrency);

    const equity = Number(account?.balance?.balance ?? 0);
    const cashBalance = Number(account?.balance?.deposit ?? (equity - Number(account?.balance?.profitLoss ?? 0)));
    const profitLoss = Number(account?.balance?.profitLoss ?? 0);
    const available = Number(account?.balance?.available ?? 0);
    const usedMargin = Math.max(0, equity - available);
    const lotSize = Math.max(0.00000001, Number(market.instrument?.lotSize ?? 1));
    const riskPerUnitInstrument = Math.abs(input.entry - input.stop) * lotSize;
    const rewardPerUnitInstrument = Math.abs(input.target - input.entry) * lotSize;
    const exposureInstrument = input.entry * input.size * lotSize;
    const conversionRate = conversion.rate;

    const riskAmount = conversionRate === null ? null : riskPerUnitInstrument * input.size * conversionRate;
    const rewardAmount = conversionRate === null ? null : rewardPerUnitInstrument * input.size * conversionRate;
    const exposure = conversionRate === null ? null : exposureInstrument * conversionRate;

    const instrumentType = normalizedInstrumentType(market.instrument?.type);
    const accountLeverage = Number(preferences.leverages?.[instrumentType]?.current ?? NaN);
    const marginFactor = Number(market.instrument?.marginFactor ?? NaN);
    const marginFactorUnit = String(market.instrument?.marginFactorUnit ?? "").toUpperCase();
    const factorLeverage = Number.isFinite(marginFactor) && marginFactor > 0 && marginFactorUnit === "PERCENTAGE" ? 100 / marginFactor : null;
    const leverage: number | null = Number.isFinite(accountLeverage) && accountLeverage > 0 ? accountLeverage : factorLeverage;
    const marginSource = Number.isFinite(accountLeverage) && accountLeverage > 0 ? "ACCOUNT_PREFERENCES" : factorLeverage !== null ? "MARKET_FACTOR" : "UNKNOWN";
    const estimatedMargin = exposure !== null && leverage !== null ? exposure / leverage : null;
    const marginKnown = estimatedMargin !== null;
    const availableAfterMargin = estimatedMargin === null ? null : available - estimatedMargin;
    const totalMarginAfter = estimatedMargin === null ? null : usedMargin + estimatedMargin;
    const marginUsageNowPct = equity > 0 ? usedMargin / equity * 100 : 0;
    const marginUsageAfterPct = equity > 0 && totalMarginAfter !== null ? totalMarginAfter / equity * 100 : null;

    const minSize = market.dealingRules?.minDealSize?.value ?? 0;
    const maxSize = market.dealingRules?.maxDealSize?.value ?? Number.MAX_SAFE_INTEGER;
    const sizeIncrement = market.dealingRules?.minSizeIncrement?.value ?? 0.01;
    const riskPct = equity && riskAmount !== null ? riskAmount / equity * 100 : 0;
    const marketStatus = market.snapshot?.marketStatus ?? "UNKNOWN";
    const sizeSteps = sizeIncrement > 0 ? Math.abs(input.size / sizeIncrement - Math.round(input.size / sizeIncrement)) : 0;

    const warnings = [
      ...(input.size < minSize ? [`الحد الأدنى للحجم ${minSize}`] : []),
      ...(input.size > maxSize ? [`الحد الأقصى للحجم ${maxSize}`] : []),
      ...(sizeSteps > 1e-7 ? [`الحجم يجب أن يكون بمضاعفات ${sizeIncrement}`] : []),
      ...(riskAmount === null ? [`تعذر تحويل عملة الأداة من ${instrumentCurrency} إلى ${accountCurrency}`] : []),
      ...(riskPct > 1.0001 ? ["المخاطرة تتجاوز 1% من الحساب"] : []),
      ...(!marginKnown ? ["تعذر احتساب الهامش من رافعة الحساب أو بيانات الأداة"] : []),
      ...(estimatedMargin !== null && estimatedMargin > available ? ["الهامش المطلوب يتجاوز الهامش الحر"] : []),
      ...(marketStatus !== "TRADEABLE" ? ["الأداة غير متاحة للتداول عبر Capital الآن"] : []),
    ];

    const preview = {
      ...input,
      tradingEnabled: envEnabled(process.env.CAPITAL_TRADING_ENABLED),
      instrumentName: market.instrument?.name ?? input.symbol,
      instrumentType,
      instrumentCurrency,
      accountCurrency,
      lotSize,
      conversionRate,
      conversionPair: conversion.pair,
      riskPerUnit: conversionRate === null ? null : riskPerUnitInstrument * conversionRate,
      riskAmount,
      rewardAmount,
      riskReward: riskAmount && rewardAmount !== null ? rewardAmount / riskAmount : 0,
      mode: capitalMode(),
      exposure,
      exposureInstrument,
      equity,
      cashBalance,
      profitLoss,
      available,
      usedMargin,
      marginUsageNowPct,
      riskPct,
      marginFactor: Number.isFinite(marginFactor) ? marginFactor : null,
      marginFactorUnit,
      accountLeverage: Number.isFinite(accountLeverage) ? accountLeverage : null,
      leverage,
      marginSource,
      estimatedMargin,
      availableAfterMargin,
      totalMarginAfter,
      marginUsageAfterPct,
      minSize,
      maxSize,
      sizeIncrement,
      marketStatus,
      warnings,
    };

    if (input.action === "preview") return NextResponse.json({ status: "preview", preview }, { headers: { ...cors, "Cache-Control": "no-store" } });
    if (!envEnabled(process.env.CAPITAL_TRADING_ENABLED)) {
      return NextResponse.json({ error: "التنفيذ الحقيقي مقفل. فعّل CAPITAL_TRADING_ENABLED بعد اختبار الحساب التجريبي.", preview }, { status: 403, headers: cors });
    }
    if (input.confirmation !== "EXECUTE" || input.score < 90 || preview.riskReward < 1.8 || warnings.length) {
      return NextResponse.json({ error: `رفض محرك المخاطر الأمر${warnings.length ? `: ${warnings.join("، ")}` : ": يلزم تأكيد صريح ونتيجة 90+ وعائد/مخاطرة 1.8+"}.`, preview }, { status: 422, headers: cors });
    }

    const body = input.type === "MARKET"
      ? { epic: input.epic, direction: input.direction, size: input.size, guaranteedStop: false, stopLevel: input.stop, profitLevel: input.target }
      : { epic: input.epic, direction: input.direction, size: input.size, level: input.entry, type: input.type, guaranteedStop: false, stopLevel: input.stop, profitLevel: input.target };
    const endpoint = input.type === "MARKET" ? "/positions" : "/workingorders";
    const result = await capitalRequest<{ dealReference?: string }>(endpoint, { method: "POST", body });
    if (!result.dealReference) throw new Error("لم ترجع Capital رقم مرجع للأمر.");
    const confirmation = await capitalRequest<DealConfirmation>(`/confirms/${encodeURIComponent(result.dealReference)}`);
    if (!confirmationAccepted(confirmation)) {
      return NextResponse.json({ error: `رفضت Capital الأمر: ${confirmation.reason || confirmation.dealStatus || confirmation.status || "سبب غير معروف"}`, dealReference: result.dealReference, confirmation, preview }, { status: 422, headers: cors });
    }
    return NextResponse.json({ status: "accepted", dealReference: result.dealReference, confirmation, preview }, { headers: cors });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "بيانات الأمر غير صالحة.", details: error.flatten() }, { status: 400, headers: cors });
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر تجهيز الأمر." }, { status: 500, headers: cors });
  }
}
