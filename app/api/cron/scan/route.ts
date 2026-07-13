import { NextResponse } from "next/server";
import { positionSize, scoreMaherHero, StockSnapshot } from "@/lib/maherHero";

export const dynamic = "force-dynamic";

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
  if (!headers) {
    throw new Error("متغيرات Alpaca غير مكتملة في Vercel.");
  }

  const baseUrl = process.env.ALPACA_BASE_URL || "https://paper-api.alpaca.markets";
  const response = await fetch(`${baseUrl}/v2/clock`, {
    headers,
    cache: "no-store",
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`تعذر قراءة حالة السوق من Alpaca (${response.status}): ${details.slice(0, 200)}`);
  }

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

async function sendPushNotification(plan: AlertPlan) {
  const topic = process.env.NTFY_TOPIC;
  const server = (process.env.NTFY_SERVER || "https://ntfy.sh").replace(/\/$/, "");
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://1-ten-sage-17.vercel.app";

  if (!topic) {
    throw new Error("أضف NTFY_TOPIC في Vercel لتفعيل إشعارات الجوال.");
  }

  const message = [
    `السهم: ${plan.symbol}`,
    `التقييم: ${plan.score}/100`,
    `الدخول المشروط: $${plan.entry.toFixed(2)}`,
    `الكمية المقترحة: ${plan.quantity} سهم`,
    `قيمة الصفقة: $${plan.netAmount.toFixed(2)}`,
    `وقف الخسارة: $${plan.stop.toFixed(2)}`,
    `الهدف الأول: $${plan.target1.toFixed(2)}`,
    `الهدف الثاني: $${plan.target2.toFixed(2)}`,
    "تحقق من السعر والحجم لحظة التنفيذ؛ التنبيه ليس أمر شراء تلقائيًا.",
  ].join("\n");

  // إرسال JSON يمنع مشاكل ترميز العناوين العربية داخل HTTP headers.
  const response = await fetch(server, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      topic,
      title: `ماهر هيرو — فرصة ${plan.score}/100`,
      message,
      priority: plan.score >= 99 ? 5 : 4,
      tags: ["chart_with_upwards_trend", "rotating_light"],
      click: siteUrl,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`فشل إرسال إشعار Push (${response.status}): ${details.slice(0, 300)}`);
  }

  return response.json();
}

async function fetchLiveScan(request: Request) {
  const scanUrl = new URL("/api/market/scan", request.url);
  scanUrl.searchParams.set("source", "cron");

  const response = await fetch(scanUrl, {
    method: "GET",
    headers: { "x-maher-hero-source": "cron" },
    cache: "no-store",
  });

  const data = await response.json();
  if (!response.ok || data.mode !== "live") {
    throw new Error(data.error || `تعذر فحص السوق الحقيقي (${response.status}).`);
  }

  return data as { mode: "live"; scanned: number; stocks: StockSnapshot[] };
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

    const scanData = await fetchLiveScan(request);

    const qualified = scanData.stocks
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

    const results = await Promise.allSettled(plans.map((plan) => sendPushNotification(plan)));
    const sent = plans.filter((_, index) => results[index]?.status === "fulfilled");
    const failed = results
      .map((result, index) =>
        result.status === "rejected"
          ? { symbol: plans[index].symbol, error: String(result.reason) }
          : null,
      )
      .filter(Boolean);

    return NextResponse.json({
      ok: failed.length === 0,
      marketOpen: true,
      scanned: scanData.scanned,
      alerted: sent.length,
      alerts: sent,
      failed,
      channel: "ntfy",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر تشغيل الفحص المجدول";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
