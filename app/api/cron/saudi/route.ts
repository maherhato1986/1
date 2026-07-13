import { NextResponse } from "next/server";
import { positionSize } from "@/lib/maherHero";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type QualifiedStock = {
  symbol: string;
  score: number;
  price: number;
  stopDistancePct: number;
  volumeRatio: number;
  rsi: number;
  breakout: string;
};

type ScanResponse = {
  mode: string;
  scanned: number;
  qualified: QualifiedStock[];
  dataTimestamp?: string | null;
  warning?: string;
};

function authorize(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function riyadhMarketOpen(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Riyadh",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const weekday = value.weekday;
  const minutes = Number(value.hour) * 60 + Number(value.minute);
  return ["Sun", "Mon", "Tue", "Wed", "Thu"].includes(weekday) && minutes >= 600 && minutes <= 900;
}

async function sendNtfy(stock: QualifiedStock, index: number) {
  const topic = process.env.NTFY_TOPIC;
  const server = (process.env.NTFY_SERVER || "https://ntfy.sh").replace(/\/$/, "");
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://1-ten-sage-17.vercel.app";
  if (!topic) throw new Error("NTFY_TOPIC غير موجود في Vercel.");

  const capital = Number(process.env.SAUDI_ALERT_CAPITAL || 10000);
  const riskPct = Number(process.env.SAUDI_ALERT_RISK_PCT || 1);
  const weights = [0.4, 0.35, 0.25];
  const entry = stock.price;
  const stop = entry * (1 - stock.stopDistancePct / 100);
  const allocationLimit = capital * 0.9 * (weights[index] ?? 0.25);
  const quantity = positionSize({ capital, riskPct, entry, stop, allocationLimit });
  const target1 = entry * (1 + Math.max(0.025, (stock.stopDistancePct / 100) * 1.25));
  const target2 = entry * (1 + Math.max(0.045, (stock.stopDistancePct / 100) * 2));

  const message = [
    `🇸🇦 السهم: ${stock.symbol}`,
    `التقييم: ${stock.score}/100`,
    `الدخول المشروط: ${entry.toFixed(2)} ر.س`,
    `الكمية المقترحة: ${quantity} سهم`,
    `قيمة الصفقة: ${(quantity * entry).toFixed(2)} ر.س`,
    `وقف الخسارة: ${stop.toFixed(2)} ر.س`,
    `الهدف الأول: ${target1.toFixed(2)} ر.س`,
    `الهدف الثاني: ${target2.toFixed(2)} ر.س`,
    `RSI: ${stock.rsi.toFixed(1)} | الحجم: ${stock.volumeRatio.toFixed(2)}×`,
    `الحالة: ${stock.breakout === "early" ? "اختراق مبكر" : "إعادة اختبار"}`,
    "المصدر تجريبي وقد تكون البيانات متأخرة؛ تحقق من تطبيق التداول قبل التنفيذ.",
  ].join("\n");

  const response = await fetch(`${server}/${encodeURIComponent(topic)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      topic,
      title: `ماهر هيرو السعودي — فرصة ${stock.score}/100`,
      message,
      priority: stock.score >= 99 ? 5 : 4,
      tags: ["saudi_arabia", "chart_with_upwards_trend", "rotating_light"],
      click: siteUrl,
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`فشل ntfy (${response.status}): ${(await response.text()).slice(0, 160)}`);
}

export async function GET(request: Request) {
  if (!authorize(request)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!riyadhMarketOpen()) {
    return NextResponse.json({ ok: true, marketOpen: false, alerted: 0, message: "السوق السعودي مغلق." });
  }

  try {
    const scanUrl = new URL("/api/saudi/scan?limit=120", request.url);
    const response = await fetch(scanUrl, { cache: "no-store" });
    const data = (await response.json()) as ScanResponse;
    if (!response.ok || data.mode !== "live") throw new Error("تعذر فحص السوق السعودي.");

    const candidates = (data.qualified ?? []).slice(0, 3);
    if (!candidates.length) {
      return NextResponse.json({
        ok: true,
        marketOpen: true,
        scanned: data.scanned,
        alerted: 0,
        message: "لا توجد فرصة سعودية بتقييم 95/100 أو أعلى.",
        dataTimestamp: data.dataTimestamp ?? null,
      });
    }

    const results = await Promise.allSettled(candidates.map((stock, index) => sendNtfy(stock, index)));
    const failed = results
      .map((result, index) => result.status === "rejected" ? { symbol: candidates[index].symbol, error: String(result.reason) } : null)
      .filter(Boolean);

    return NextResponse.json({
      ok: failed.length === 0,
      marketOpen: true,
      scanned: data.scanned,
      alerted: candidates.length - failed.length,
      alerts: candidates,
      failed,
      provider: "yahoo-finance-unofficial",
      dataTimestamp: data.dataTimestamp ?? null,
      warning: data.warning,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "تعذر تشغيل الفحص السعودي" }, { status: 500 });
  }
}
