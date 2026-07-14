import OpenAI from "openai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { scoreMaherHero, StockSnapshot } from "@/lib/maherHero";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const requestSchema = z.object({
  market: z.enum(["US", "SA"]),
  capital: z.number().min(100).max(10_000_000),
  riskPct: z.number().min(0.1).max(3),
});

const requests = new Map<string, number>();
const RATE_LIMIT_MS = 30_000;

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
      return NextResponse.json({ error: "يرجى الانتظار 30 ثانية قبل إعادة الفحص." }, { status: 429 });
    }
    requests.set(key, now);

    const input = requestSchema.parse(await request.json());
    const origin = new URL(request.url).origin;
    const scanPath = input.market === "US" ? "/api/market/scan" : "/api/saudi/scan?limit=180";
    const marketResponse = await fetch(`${origin}${scanPath}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(50_000),
      headers: { "x-maher-hero-source": "analysis" },
    });
    const marketData = await readJsonResponse(marketResponse);
    if (!marketResponse.ok || marketData.mode !== "live") {
      throw new Error(marketData.error || marketData.errors?.[0] || "تعذر جلب بيانات السوق الحقيقية");
    }

    const stocks = (input.market === "US" ? marketData.stocks : marketData.top) as StockSnapshot[];
    const ranked = stocks
      .map((stock) => ({ ...stock, ...scoreMaherHero(stock) }))
      .sort((a, b) => b.score - a.score || b.volumeRatio - a.volumeRatio);

    if (!ranked.length) {
      return NextResponse.json({
        mode: "local",
        provider: marketData.provider,
        scanned: marketData.scanned,
        picks: [],
        watchlist: [],
        message: "تم جلب بيانات السوق، لكن لم تتوفر أسهم صالحة للتحليل وفق شروط السعر والسيولة الحالية.",
        warning: marketData.warning,
      });
    }

    const picks = ranked.filter((stock) => stock.score >= 95).slice(0, 3);
    const watchlist = ranked.filter((stock) => stock.score < 95).slice(0, 5);
    const topCandidates = ranked.slice(0, 3);

    const localMessage = picks.length
      ? "تم اعتماد الفرص التي تجاوزت 95/100 بواسطة محرك ماهر هيرو."
      : "لا توجد فرصة دخول مؤكدة بدرجة 95/100 أو أعلى؛ تم تحليل أفضل المرشحين للمراقبة دون توصية شراء.";

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({
        mode: "local",
        provider: marketData.provider,
        scanned: marketData.scanned,
        message: `${localMessage} الشرح الذكي غير مفعّل لعدم توفر OPENAI_API_KEY في بيئة النشر.`,
        picks,
        watchlist,
        warning: marketData.warning,
        openaiConfigured: false,
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
              "أنت تشرح نتائج محرك ماهر هيرو فقط ولا تغيّر درجاته ولا تخترع أخبارًا أو أسعارًا. إذا لم توجد فرصة 95/100، اشرح أفضل ثلاثة مرشحين للمراقبة، ولماذا لم يصلوا إلى درجة الدخول، وما الشروط الفنية التي يجب تحققها قبل التفكير بالدخول. إذا وجدت فرصًا 95/100 أو أعلى، اشرح سبب الاختيار وشروط إلغاء الدخول. اذكر دائمًا أن التنفيذ مشروط وليس ضمانًا للربح.",
          },
          {
            role: "user",
            content: JSON.stringify({
              market: input.market,
              capital: input.capital,
              riskPct: input.riskPct,
              confirmedPicks: picks,
              topCandidates,
            }),
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
        openaiConfigured: true,
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
        openaiConfigured: true,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر تحليل البيانات";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
