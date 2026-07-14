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
      .map((stock) => ({ ...stock, ...scoreMaherHero(stock) }))
      .sort((a, b) => b.score - a.score || b.volumeRatio - a.volumeRatio);

    const picks = ranked.filter((stock) => stock.score >= 90).slice(0, 10);
    const watchlist = ranked.filter((stock) => stock.score < 90).slice(0, 5);
    const localMessage = picks.length
      ? `تم رصد ${picks.length} فرصة بدرجة 90/100 أو أعلى. يجب التأكد من بقاء السعر داخل منطقة الدخول قبل التنفيذ.`
      : "لا توجد فرصة أمريكية بدرجة 90/100 أو أعلى في الفحص الحالي.";

    if (!process.env.OPENAI_API_KEY || input.automatic) {
      return NextResponse.json({
        mode: "local",
        provider: marketData.provider,
        scanned: marketData.scanned,
        message: localMessage,
        picks,
        watchlist,
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
            content:
              "أنت تشرح نتائج محرك ماهر هيرو فقط ولا تغيّر درجاته ولا تخترع أخبارًا أو أسعارًا. اشرح فرص 90/100 أو أعلى وشروط إلغاء الدخول، واذكر أن التنفيذ مشروط وليس ضمانًا للربح.",
          },
          {
            role: "user",
            content: JSON.stringify({ market: "US", capital: input.capital, riskPct: input.riskPct, picks, topCandidates: ranked.slice(0, 3) }),
          },
        ],
      });

      return NextResponse.json({
        mode: "openai",
        provider: marketData.provider,
        scanned: marketData.scanned,
        picks,
        watchlist,
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
        picks,
        watchlist,
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
