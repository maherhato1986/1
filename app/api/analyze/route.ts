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
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({
        mode: "local",
        message: "تم استخدام محرك ماهر هيرو المحلي؛ أضف مفتاح OpenAI الجديد في بيئة الخادم لتفعيل الشرح الذكي.",
        picks: ranked,
      });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5-mini",
      input: [
        {
          role: "system",
          content: "أنت محلل مساعد لاستراتيجية ماهر هيرو. حلل البيانات المقدمة فقط، لا تخترع أسعارًا أو أخبارًا، واجعل كل دخول مشروطًا بتأكيد السعر والحجم. وضح أن التحليل لا يضمن الربح.",
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
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر تحليل البيانات";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
