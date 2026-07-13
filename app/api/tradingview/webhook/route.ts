import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type TradingViewAlert = {
  secret?: string;
  market?: string;
  symbol?: string;
  name?: string;
  timeframe?: string;
  score?: number | string;
  price?: number | string;
  stop?: number | string;
  target1?: number | string;
  target2?: number | string;
  rsi?: number | string;
  volumeRatio?: number | string;
  signal?: string;
  timestamp?: string;
};

function numberValue(value: number | string | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function sendNtfy(alert: TradingViewAlert) {
  const topic = process.env.NTFY_TOPIC;
  const server = (process.env.NTFY_SERVER || "https://ntfy.sh").replace(/\/$/, "");
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://1-ten-sage-17.vercel.app";

  if (!topic) throw new Error("NTFY_TOPIC غير موجود في Vercel.");

  const score = numberValue(alert.score);
  const price = numberValue(alert.price);
  const stop = numberValue(alert.stop);
  const target1 = numberValue(alert.target1);
  const target2 = numberValue(alert.target2);
  const rsi = numberValue(alert.rsi);
  const volumeRatio = numberValue(alert.volumeRatio);
  const symbol = String(alert.symbol || "غير معروف").replace(/^TADAWUL:/, "");

  const message = [
    `🇸🇦 السهم: ${symbol}${alert.name ? ` — ${alert.name}` : ""}`,
    `التقييم: ${score.toFixed(0)}/100`,
    `الإشارة: ${alert.signal || "اختراق مبكر"}`,
    `الفاصل: ${alert.timeframe || "5 دقائق"}`,
    `الدخول المشروط: ${price.toFixed(2)} ر.س`,
    `وقف الخسارة: ${stop.toFixed(2)} ر.س`,
    `الهدف الأول: ${target1.toFixed(2)} ر.س`,
    `الهدف الثاني: ${target2.toFixed(2)} ر.س`,
    `RSI: ${rsi.toFixed(1)} | حجم التداول: ${volumeRatio.toFixed(2)}×`,
    "تنبيه تحليلي فقط؛ تحقّق من السعر والسيولة قبل التنفيذ.",
  ].join("\n");

  const response = await fetch(`${server}/${encodeURIComponent(topic)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      topic,
      title: `ماهر هيرو السعودي — فرصة ${score.toFixed(0)}/100`,
      message,
      priority: score >= 99 ? 5 : 4,
      tags: ["saudi_arabia", "chart_with_upwards_trend", "rotating_light"],
      click: siteUrl,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`فشل إرسال إشعار ntfy (${response.status}): ${details.slice(0, 200)}`);
  }
}

export async function POST(request: Request) {
  try {
    const expectedSecret = process.env.TV_WEBHOOK_SECRET;
    if (!expectedSecret) {
      return NextResponse.json({ ok: false, error: "TV_WEBHOOK_SECRET غير موجود في Vercel." }, { status: 500 });
    }

    const contentType = request.headers.get("content-type") || "";
    const payload = contentType.includes("application/json")
      ? ((await request.json()) as TradingViewAlert)
      : (JSON.parse(await request.text()) as TradingViewAlert);

    if (payload.secret !== expectedSecret) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const score = numberValue(payload.score);
    if (!payload.symbol || score < 95) {
      return NextResponse.json({
        ok: true,
        notified: false,
        reason: !payload.symbol ? "رمز السهم مفقود" : "التقييم أقل من 95",
      });
    }

    await sendNtfy(payload);
    return NextResponse.json({
      ok: true,
      notified: true,
      provider: "tradingview",
      market: payload.market || "SA",
      symbol: payload.symbol,
      score,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر استقبال تنبيه TradingView";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "TradingView webhook",
    method: "POST",
    secretConfigured: Boolean(process.env.TV_WEBHOOK_SECRET),
    note: "لا ينفذ هذا المسار أي أوامر شراء أو بيع.",
  });
}
