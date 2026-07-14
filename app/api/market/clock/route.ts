import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const tradingBaseUrl = process.env.ALPACA_TRADING_BASE_URL || "https://paper-api.alpaca.markets";

export async function GET() {
  const key = process.env.ALPACA_API_KEY;
  const secret = process.env.ALPACA_API_SECRET;

  if (!key || !secret) {
    return NextResponse.json({ isOpen: false, error: "بيانات Alpaca غير مكتملة" }, { status: 503 });
  }

  try {
    const response = await fetch(`${tradingBaseUrl}/v2/clock`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
      headers: { "APCA-API-KEY-ID": key, "APCA-API-SECRET-KEY": secret },
    });
    const data = await response.json();
    if (!response.ok) {
      return NextResponse.json({ isOpen: false, error: data?.message || "تعذر قراءة حالة السوق" }, { status: 502 });
    }

    return NextResponse.json({
      isOpen: Boolean(data.is_open),
      timestamp: data.timestamp,
      nextOpen: data.next_open,
      nextClose: data.next_close,
    });
  } catch (error) {
    return NextResponse.json(
      { isOpen: false, error: error instanceof Error ? error.message : "تعذر قراءة حالة السوق" },
      { status: 502 },
    );
  }
}
