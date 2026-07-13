import OpenAI from "openai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { scoreMaherHero, StockSnapshot } from "@/lib/maherHero";

const requestSchema = z.object({
  market: z.enum(["US", "SA"]),
  capital: z.number().positive(),
  riskPct: z.number().min(0.1).max(3),
  stocks: z.array(z.object({
    symbol: z.string().min(1).max(12),
    name: z.string().min(1),
    market: z.enum(["US", "SA"]),
    price: z.number().positive(),
    changePct: z.number(),
    volumeRatio: z.number().nonnegative(),
    rsi: z.number().min(0).max(100),
    macdSignal: z.enum(["bullish", "bearish", "neutral"]),
    trend: z.enum(["up", "down", "sideways"]),
    breakout: z.enum(["early", "retest", "late", "none"]),
    resistanceDistancePct: z.number(),
    stopDistancePct: z.number().positive(),
  })).min(1).max(30),
});

export async function POST(request: Request) {
  try {
    const input = requestSchema.parse(await request.json());
    const ranked = input.stocks
      .map((stock) => ({ ...stock, ...scoreMaherHero(stock as StockSnapshot) }))
      .filter((stock) => stock.score >= 95)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    if (!ranked.length) {
      return NextResponse.json({
        mode: "local",
        picks: [],
        message: "لا توجد حاليًا فرصة مضاربة يومية تحقق تقييم ماهر هيرو 95/100 أو أعلى. الأفضل الانتظار وعدم الدخول.",
      });
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({
        mode: "local",
        message: "تم اعتماد الفرص التي تجاوزت 95/100 بواسطة محرك ماهر هيرو المحلي. الشرح الذكي غير مفعّل لعدم توفر مفتاح OpenAI.",
        picks: ranked,
      });
    }

    try {
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const response = await client.responses.create({
        model: process.env.OPENAI_MODEL || "gpt-5-mini",
        input: [
          {
            role: "system",
            content: "أنت محلل مضاربة يومية لاستراتيجية ماهر هيرو. حلل فقط الأسهم التي حصلت على 95/100 أو أعلى. لا تخترع أسعارًا أو أخبارًا. لكل سهم وضح باختصار: سعر الدخول المشروط، وقف الخسارة، الهدف الأول للبيع في نفس اليوم، الهدف الثاني، سبب الاختيار، وشرط إلغاء الدخول إذا ضعف الحجم أو الزخم. وضح أن التنفيذ مشروط وليس ضمانًا للربح.",
          },
          {
            role: "user",
            content: JSON.stringify({ market: input.market, capital: input.capital, riskPct: input.riskPct, ranked }),
          },
        ],
      });

      return NextResponse.json({
        mode: "openai",
        picks: ranked,
        narrative: response.output_text,
      });
    } catch (openAIError) {
      const details = openAIError instanceof Error ? openAIError.message : "تعذر الوصول إلى OpenAI";
      const quotaProblem = /quota|billing|429|usage limit/i.test(details);

      return NextResponse.json({
        mode: "local-fallback",
        picks: ranked,
        message: quotaProblem
          ? "تم عرض الفرص التي تجاوزت 95/100 بواسطة محرك ماهر هيرو المحلي. رصيد OpenAI API غير متاح حاليًا."
          : "تم عرض الفرص التي تجاوزت 95/100 بواسطة محرك ماهر هيرو المحلي لأن خدمة الشرح الذكي غير متاحة مؤقتًا.",
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر تحليل البيانات";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
