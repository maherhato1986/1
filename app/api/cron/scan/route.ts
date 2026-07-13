import { NextResponse } from "next/server";
import { GET as scanMarket } from "@/app/api/market/scan/route";
import { positionSize, scoreMaherHero, StockSnapshot } from "@/lib/maherHero";

const allocationWeights = [0.4, 0.35, 0.25];

function envNumber(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function authorize(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function alpacaHeaders() {
  const key = process.env.ALPACA_API_KEY;
  const secret = process.env.ALPACA_API_SECRET;
  if (!key || !secret) return null;
  return {
    "APCA-API-KEY-ID": key,
    "APCA-API-SECRET-KEY": secret,
  };
}

async function isUsMarketOpen() {
  const headers = alpacaHeaders();
  if (!headers) return false;

  const baseUrl = process.env.ALPACA_BASE_URL || "https://paper-api.alpaca.markets";
  const response = await fetch(`${baseUrl}/v2/clock`, {
    headers,
    cache: "no-store",
  });

  if (!response.ok) return false;
  const clock = (await response.json()) as { is_open?: boolean };
  return Boolean(clock.is_open);
}

type AlertPlan = {
  symbol: string;
  score: number;
  entry: number;
  quantity: number;
  netAmount: number;
  stop: number;
  target1: number;
  target2: number;
};

function buildPlan(stock: StockSnapshot & { score: number }, index: number): AlertPlan {
  const capital = envNumber("ALERT_CAPITAL", 5000);
  const riskPct = envNumber("ALERT_RISK_PCT", 1);
  const tradableCapital = capital * 0.9;
  const allocationLimit = tradableCapital * (allocationWeights[index] ?? 0.25);
  const entry = stock.price;
  const stop = entry * (1 - stock.stopDistancePct / 100);
  const riskFraction = stock.stopDistancePct / 100;
  const target1 = entry * (1 + Math.max(0.025, riskFraction * 1.25));
  const target2 = entry * (1 + Math.max(0.045, riskFraction * 2));
  const quantity = positionSize({ capital, riskPct, entry, stop, allocationLimit });

  return {
    symbol: stock.symbol,
    score: stock.score,
    entry,
    quantity,
    netAmount: quantity * entry,
    stop,
    target1,
    target2,
  };
}

async function sendWhatsAppTemplate(plan: AlertPlan) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const to = process.env.WHATSAPP_TO;
  const templateName = process.env.WHATSAPP_TEMPLATE_NAME || "maher_hero_alert";
  const languageCode = process.env.WHATSAPP_TEMPLATE_LANG || "ar";
  const graphVersion = process.env.WHATSAPP_GRAPH_VERSION || "v23.0";

  if (!token || !phoneNumberId || !to) {
    throw new Error("متغيرات WhatsApp غير مكتملة في Vercel.");
  }

  const values = [
    plan.symbol,
    String(plan.score),
    plan.entry.toFixed(2),
    String(plan.quantity),
    plan.netAmount.toFixed(2),
    plan.stop.toFixed(2),
    plan.target1.toFixed(2),
    plan.target2.toFixed(2),
  ];

  const response = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: languageCode },
        components: [
          {
            type: "body",
            parameters: values.map((text) => ({ type: "text", text })),
          },
        ],
      },
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`فشل إرسال WhatsApp (${response.status}): ${details.slice(0, 300)}`);
  }

  return response.json();
}

export async function GET(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const marketOpen = await isUsMarketOpen();
    if (!marketOpen) {
      return NextResponse.json({
        ok: true,
        marketOpen: false,
        alerted: 0,
        message: "السوق الأمريكي مغلق؛ لم يتم إرسال تنبيه.",
      });
    }

    const scanResponse = await scanMarket();
    const scanData = await scanResponse.json();

    if (!scanResponse.ok || scanData.mode !== "live") {
      throw new Error(scanData.error || "تعذر فحص السوق الحقيقي.");
    }

    const qualified = (scanData.stocks as StockSnapshot[])
      .map((stock) => ({ ...stock, ...scoreMaherHero(stock) }))
      .filter((stock) => stock.score >= 95)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    if (!qualified.length) {
      return NextResponse.json({
        ok: true,
        marketOpen: true,
        scanned: scanData.scanned,
        alerted: 0,
        message: "لا توجد فرصة بتقييم 95/100 أو أعلى.",
      });
    }

    const plans = qualified
      .map((stock, index) => buildPlan(stock, index))
      .filter((plan) => plan.quantity > 0);

    const sent = [];
    for (const plan of plans) {
      await sendWhatsAppTemplate(plan);
      sent.push(plan);
    }

    return NextResponse.json({
      ok: true,
      marketOpen: true,
      scanned: scanData.scanned,
      alerted: sent.length,
      alerts: sent,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر تشغيل الفحص المجدول";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
