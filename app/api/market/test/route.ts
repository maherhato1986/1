import { NextResponse } from "next/server";

export async function GET() {
  const key = process.env.ALPACA_API_KEY;
  const secret = process.env.ALPACA_API_SECRET;

  if (!key || !secret) {
    return NextResponse.json(
      {
        ok: false,
        stage: "environment",
        keyPresent: Boolean(key),
        secretPresent: Boolean(secret),
        message: "متغيرات Alpaca غير مكتملة في Vercel.",
      },
      { status: 500 },
    );
  }

  try {
    const response = await fetch("https://paper-api.alpaca.markets/v2/account", {
      headers: {
        "APCA-API-KEY-ID": key,
        "APCA-API-SECRET-KEY": secret,
      },
      cache: "no-store",
    });

    const text = await response.text();
    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(text) as Record<string, unknown>;
    } catch {
      payload = { raw: text.slice(0, 200) };
    }

    if (!response.ok) {
      return NextResponse.json(
        {
          ok: false,
          stage: "alpaca-auth",
          status: response.status,
          message: payload.message ?? payload.raw ?? "رفض Alpaca بيانات الدخول.",
        },
        { status: response.status },
      );
    }

    return NextResponse.json({
      ok: true,
      stage: "connected",
      accountStatus: payload.status,
      tradingBlocked: payload.trading_blocked,
      accountBlocked: payload.account_blocked,
      cash: payload.cash,
      buyingPower: payload.buying_power,
      message: "تم الاتصال بحساب Alpaca Paper Trading بنجاح.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        stage: "network",
        message: error instanceof Error ? error.message : "تعذر الاتصال بـ Alpaca.",
      },
      { status: 502 },
    );
  }
}
