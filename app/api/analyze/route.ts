import OpenAI from "openai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { scoreMaherHero, StockSnapshot } from "@/lib/maherHero";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const requestSchema = z.object({
  market: z.literal("US").default("US"),
  capital: z.number().min(100).max(10_000_000),
  riskPct: z.number().min(0.1).max(3),
  automatic: z.boolean().optional().default(false),
});

const requests = new Map<string, number>();
const RATE_LIMIT_MS = 25_000;

function clientKey(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anonymous";
}

async function readJsonResponse(response: Response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const text = await response.text();
    throw new Error(`خدمة الفحص أعادت صفحة غير صالحة بدل البيانات (${response.status}). ${text.slice(0, 100)}`);
  }
  return response.json();
}

function roundPrice(value: number) {
  const digits = value < 1 ? 4 : value < 10 ? 3 : 2;
  return Number(value.toFixed(digits));
}

function tradePlan(stock: StockSnapshot & ReturnType<typeof scoreMaherHero>) {
  const price = stock.price;
  const stopPct = Math.max(1.2, Math.min(stock.stopDistancePct || 3, 6));
  const entryPadding = stock.breakout === "retest" ? 0.002 : stock.breakout === "early" ? 0.004 : 0.008;
  const entryLow = price * (1 - entryPadding);
  const entryHigh = price * (1 + Math.min(entryPadding, 0.006));
  const stopLoss = price * (1 - stopPct / 100);
  const risk = Math.max(price - stopLoss, price * 0.012);
  const resistanceTarget = price * (1 + Math.max(2, stock.resistanceDistancePct) / 100);
  const target1 = Math.min(resistanceTarget, price + risk * 1.5);
  const target2 = Math.max(target1, Math.min(price + risk * 2.5, price * 1.12));
  const target3 = Math.max(target2, Math.min(price + risk * 3.5, price * 1.18));

  let buyTiming = "انتظار تأكيد؛ لا تدخل الآن";
  if (stock.score >= 90 && stock.breakout === "early") buyTiming = "بعد إغلاق شمعة 5 دقائق فوق الاختراق مع ارتفاع الحجم";
  else if (stock.score >= 85 && stock.breakout === "retest") buyTiming = "عند ثبات إعادة الاختبار وظهور شمعة ارتداد على 5 دقائق";
  else if (stock.trend === "up" && stock.macdSignal === "bullish") buyTiming = "راقب أول 30–90 دقيقة وانتظر اختراقًا أو إعادة اختبار واضحة";

  let sellTiming = "لا توجد صفقة؛ البيع غير مطبق";
  if (stock.score >= 85) sellTiming = "بيع جزئي عند الهدف الأول، ثم حماية الباقي بوقف متحرك";
  if (stock.score >= 90) sellTiming = "بيع 40% عند الهدف الأول، 40% عند الثاني، والباقي بوقف متحرك";

  const preferredSession = stock.volumeRatio >= 2
    ? "أول 90 دقيقة بعد افتتاح نيويورك"
    : stock.breakout === "retest"
      ? "منتصف الجلسة بعد هدوء الافتتاح وتأكيد إعادة الاختبار"
      : "راقبه خلال الجلسة ولا تدخل دون زيادة واضحة في السيولة";

  const invalidation = stock.resistanceDistancePct < 2
    ? "إلغاء الدخول لأن المقاومة قريبة ما لم يغلق فوقها بحجم قوي"
    : `إلغاء الدخول بكسر ${roundPrice(stopLoss)} أو ضعف الحجم مع انعكاس MACD`;

  return {
    entryLow: roundPrice(entryLow),
    entryHigh: roundPrice(entryHigh),
    stopLoss: roundPrice(stopLoss),
    target1: roundPrice(target1),
    target2: roundPrice(target2),
    target3: roundPrice(target3),
    buyTiming,
    sellTiming,
    preferredSession,
    invalidation,
    riskReward: Number(((target2 - price) / Math.max(price - stopLoss, 0.0001)).toFixed(2)),
  };
}

export async function POST(request: Request) {
  try {
    const key = clientKey(request);
    const now = Date.now();
    const previous = requests.get(key) ?? 0;
    if (now - previous < RATE_LIMIT_MS) {
      return NextResponse.json({ error: "يرجى الانتظار قليلًا قبل إعادة الفحص." }, { status: 429 });
    }
    requests.set(key, now);

    const input = requestSchema.parse(await request.json());
    const origin = new URL(request.url).origin;
    const marketResponse = await fetch(`${origin}/api/market/scan`, {
      cache: "no-store",
      signal: AbortSignal.timeout(50_000),
      headers: { "x-maher-hero-source": input.automatic ? "auto-radar" : "manual-analysis" },
    });
    const marketData = await readJsonResponse(marketResponse);
    if (!marketResponse.ok || marketData.mode !== "live") {
      throw new Error(marketData.error || marketData.errors?.[0] || "تعذر جلب بيانات السوق الحقيقية");
    }

    const stocks = marketData.stocks as StockSnapshot[];
    const ranked = stocks
      .map((stock) => {
        const scored = { ...stock, ...scoreMaherHero(stock) };
        return { ...scored, ...tradePlan(scored) };
      })
      .sort((a, b) => b.score - a.score || b.volumeRatio - a.volumeRatio);

    const opportunities90 = ranked.filter((stock) => stock.score >= 90);
    const localMessage = opportunities90.length
      ? `تم رصد ${opportunities90.length} فرصة بدرجة 90/100 أو أعلى. تعرض الصفحة خطة جميع أسهم القائمة.`
      : "لا توجد فرصة بدرجة 90/100 أو أعلى حاليًا. تعرض الصفحة جميع الأسهم مع شروط الانتظار والدخول المشروط.";

    if (!process.env.OPENAI_API_KEY || input.automatic) {
      return NextResponse.json({
        mode: "local",
        provider: marketData.provider,
        scanned: marketData.scanned,
        analyzed: marketData.analyzed ?? ranked.length,
        message: localMessage,
        picks: ranked,
        opportunities90,
        opportunityCount: opportunities90.length,
        warning: marketData.warning,
        timestamp: marketData.timestamp || new Date().toISOString(),
        threshold: 90,
      });
    }

    try {
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const response = await client.responses.create({
        model: process.env.OPENAI_MODEL || "gpt-5-mini",
        input: [
          {
            role: "system",
            content: "أنت تشرح نتائج محرك ماهر هيرو فقط ولا تغيّر درجاته ولا تخترع أخبارًا أو أسعارًا. لخّص أفضل خمسة مرشحين وشروط إلغاء الدخول، ولا تعتبر أي نتيجة ضمانًا للربح.",
          },
          {
            role: "user",
            content: JSON.stringify({ market: "US", capital: input.capital, riskPct: input.riskPct, opportunityCount: opportunities90.length, topCandidates: ranked.slice(0, 5) }),
          },
        ],
      });

      return NextResponse.json({
        mode: "openai",
        provider: marketData.provider,
        scanned: marketData.scanned,
        analyzed: marketData.analyzed ?? ranked.length,
        picks: ranked,
        opportunities90,
        opportunityCount: opportunities90.length,
        narrative: response.output_text || localMessage,
        warning: marketData.warning,
        timestamp: marketData.timestamp || new Date().toISOString(),
        threshold: 90,
      });
    } catch (openAIError) {
      const details = openAIError instanceof Error ? openAIError.message : "تعذر الاتصال بخدمة OpenAI";
      return NextResponse.json({
        mode: "local-fallback",
        provider: marketData.provider,
        scanned: marketData.scanned,
        analyzed: marketData.analyzed ?? ranked.length,
        picks: ranked,
        opportunities90,
        opportunityCount: opportunities90.length,
        message: `${localMessage} تعذر تشغيل الشرح الذكي: ${details.slice(0, 180)}`,
        warning: marketData.warning,
        timestamp: marketData.timestamp || new Date().toISOString(),
        threshold: 90,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر تحليل البيانات";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
