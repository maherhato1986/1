import { NextResponse } from "next/server";
import { z } from "zod";
import { capitalMode, capitalRequest } from "@/lib/capital/client";
import { authorized } from "@/lib/capital/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" };
const orderSchema = z.object({
  action: z.enum(["preview", "execute"]).default("preview"),
  epic: z.string().min(1).max(80), symbol: z.string().min(1).max(20),
  direction: z.enum(["BUY", "SELL"]).default("BUY"),
  type: z.enum(["MARKET", "LIMIT", "STOP"]).default("STOP"),
  size: z.number().positive().max(100_000), entry: z.number().positive(), stop: z.number().positive(), target: z.number().positive(),
  score: z.number().min(0).max(100), confirmation: z.string().optional(),
});
type MarketDetails = { instrument?: { marginFactor?: number; marginFactorUnit?: string }; dealingRules?: { minDealSize?: { value?: number }; maxDealSize?: { value?: number }; minSizeIncrement?: { value?: number } }; snapshot?: { marketStatus?: string } };
type AccountsResponse = { accounts?: Array<{ balance?: { balance?: number; profitLoss?: number; available?: number } }> };

function envEnabled(value: string | undefined) {
  return ["true", "1", "yes", "on"].includes(String(value ?? "").trim().toLowerCase());
}

export function OPTIONS() { return new NextResponse(null, { status: 204, headers: cors }); }

export async function POST(request: Request) {
  try {
    if (!authorized(request)) return NextResponse.json({ error: "غير مصرح بالوصول إلى Capital Bot." }, { status: 401, headers: cors });
    const input = orderSchema.parse(await request.json());
    const riskPerUnit = Math.abs(input.entry - input.stop);
    const riskAmount = riskPerUnit * input.size;
    const rewardAmount = Math.abs(input.target - input.entry) * input.size;
    const [market, accounts] = await Promise.all([
      capitalRequest<MarketDetails>(`/markets/${encodeURIComponent(input.epic)}`),
      capitalRequest<AccountsResponse>("/accounts"),
    ]);
    const equity = accounts.accounts?.[0]?.balance?.balance ?? 0;
    const available = accounts.accounts?.[0]?.balance?.available ?? 0;
    const exposure = input.entry * input.size;
    const marginFactor = market.instrument?.marginFactor ?? 0;
    const estimatedMargin = market.instrument?.marginFactorUnit === "PERCENTAGE" ? exposure * marginFactor / 100 : exposure / Math.max(1, marginFactor);
    const minSize = market.dealingRules?.minDealSize?.value ?? 0;
    const maxSize = market.dealingRules?.maxDealSize?.value ?? Number.MAX_SAFE_INTEGER;
    const riskPct = equity ? riskAmount / equity * 100 : 0;
    const warnings = [
      ...(input.size < minSize ? [`الحد الأدنى للحجم ${minSize}`] : []),
      ...(input.size > maxSize ? [`الحد الأقصى للحجم ${maxSize}`] : []),
      ...(riskPct > 1 ? ["المخاطرة تتجاوز 1% من الحساب"] : []),
      ...(estimatedMargin > available ? ["الهامش المطلوب يتجاوز المتاح"] : []),
      ...(market.snapshot?.marketStatus !== "TRADEABLE" ? ["السوق غير متاح للتداول الآن"] : []),
    ];
    const preview = { ...input, tradingEnabled: envEnabled(process.env.CAPITAL_TRADING_ENABLED), riskPerUnit, riskAmount, rewardAmount, riskReward: riskAmount ? rewardAmount / riskAmount : 0, mode: capitalMode(), exposure, equity, available, riskPct, marginFactor, estimatedMargin, availableAfterMargin: available - estimatedMargin, minSize, maxSize, sizeIncrement: market.dealingRules?.minSizeIncrement?.value ?? 0.01, marketStatus: market.snapshot?.marketStatus ?? "UNKNOWN", warnings };
    if (input.action === "preview") return NextResponse.json({ status: "preview", preview }, { headers: { ...cors, "Cache-Control": "no-store" } });
    if (!envEnabled(process.env.CAPITAL_TRADING_ENABLED)) {
      return NextResponse.json({ error: "التنفيذ الحقيقي مقفل. فعّل CAPITAL_TRADING_ENABLED بعد اختبار الحساب التجريبي.", preview }, { status: 403, headers: cors });
    }
    if (input.confirmation !== "EXECUTE" || input.score < 90 || preview.riskReward < 1.8 || warnings.length) {
      return NextResponse.json({ error: `رفض محرك المخاطر الأمر${warnings.length ? `: ${warnings.join("، ")}` : ": يلزم تأكيد صريح ونتيجة 90+ وعائد/مخاطرة 1.8+"}.`, preview }, { status: 422, headers: cors });
    }
    const body = input.type === "MARKET"
      ? { epic: input.epic, direction: input.direction, size: input.size, guaranteedStop: false, stopLevel: input.stop, profitLevel: input.target }
      : { epic: input.epic, direction: input.direction, size: input.size, level: input.entry, type: "GOOD_TILL_CANCELLED", guaranteedStop: false, stopLevel: input.stop, profitLevel: input.target };
    const endpoint = input.type === "MARKET" ? "/positions" : "/workingorders";
    const result = await capitalRequest<{ dealReference?: string }>(endpoint, { method: "POST", body });
    if (!result.dealReference) throw new Error("لم ترجع Capital رقم مرجع للأمر.");
    const confirmation = await capitalRequest(`/confirms/${encodeURIComponent(result.dealReference)}`);
    return NextResponse.json({ status: "submitted", dealReference: result.dealReference, confirmation }, { headers: cors });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "بيانات الأمر غير صالحة.", details: error.flatten() }, { status: 400, headers: cors });
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر تجهيز الأمر." }, { status: 500, headers: cors });
  }
}
