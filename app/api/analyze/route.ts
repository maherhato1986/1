import OpenAI from "openai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { scoreMaherHero, StockSnapshot } from "@/lib/maherHero";

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
    const marketResponse = await fetch(`${origin}${scanPath}`, { cache: "no-store", signal: AbortSignal.timeout(55_000) });
    const marketData = await marketResponse.json();
    if (!marketResponse.ok || marketData.mode !== "live") {
      throw new Error(marketData.error || marketData.errors?.[0] || "تعذر جلب بيانات السوق الحقيقية");
    }

    const stocks = (input.market === "US" ? marketData.stocks : marketData.top) as StockSnapshot[];
    const ranked = stocks
      .map((stock) => ({ ...stock, ...scoreMaherHero(stock) }))
      .sort((a, b) => b.score - a.score || b.volumeRatio - a.volumeRatio);
    const picks = ranked.filter((stock) => stock.score >= 95).slice(0, 3);
    const watchlist = ranked.filter((stock) => stock.score >= 80 && stock.score < 95).slice(0, 5);

    if (!picks.length) {
      return NextResponse.json({
        mode: "local",
        provider: marketData.provider,
        scanned: marketData.scanned,
        picks: [],
        watchlist,
        message: "لا توجد حاليًا فرصة تحقق 95/100 أو أعلى. تم عرض أفضل أسهم المراقبة دون توصية دخول.",
        warning: marketData.warning,
      });
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({
        mode: "local",
        provider: marketData.provider,
        scanned: marketData.scanned,
        message: "تم اعتماد الفرص بواسطة محرك ماهر هيرو المحلي. الشرح الذكي غير مفعّل.",
        picks,
        watchlist,
        warning: marketData.warning,
      });
    }

    try {
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const response = await client.responses.create({
        model: process.env.OPENAI_MODEL || "gpt-5-mini",
        input: [
          {
            role: "system",
            content: "أنت تشرح نتائج محرك ماهر هيرو فقط ولا تغيّر درجاته ولا تخترع أخبارًا أو أسعارًا. اشرح بإيجاز سبب الاختيار وشروط إلغاء الدخول، واذكر أن التنفيذ مشروط وليس ضمانًا للربح.",
          },
          { role: "user", content: JSON.stringify({ market: input.market, capital: input.capital, riskPct: input.riskPct, picks }) },
        ],
      });
      return NextResponse.json({ mode: "openai", provider: marketData.provider, scanned: marketData.scanned, picks, watchlist, narrative: response.output_text, warning: marketData.warning });
    } catch {
      return NextResponse.json({ mode: "local-fallback", provider: marketData.provider, scanned: marketData.scanned, picks, watchlist, message: "تم عرض النتائج المحلية لأن خدمة الشرح الذكي غير متاحة مؤقتًا.", warning: marketData.warning });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر تحليل البيانات";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
