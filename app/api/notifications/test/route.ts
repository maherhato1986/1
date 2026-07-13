import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const topic = process.env.NTFY_TOPIC;
  const server = (process.env.NTFY_SERVER || "https://ntfy.sh").replace(/\/$/, "");
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://1-ten-sage-17.vercel.app";

  if (!topic) {
    return NextResponse.json(
      { ok: false, stage: "environment", error: "NTFY_TOPIC غير موجود في Vercel." },
      { status: 500 },
    );
  }

  try {
    const response = await fetch(`${server}/${encodeURIComponent(topic)}`, {
      method: "POST",
      headers: {
        Title: "اختبار ماهر هيرو",
        Priority: "high",
        Tags: "white_check_mark,chart_with_upwards_trend",
        Click: siteUrl,
        "Content-Type": "text/plain; charset=utf-8",
      },
      body: `تم نجاح اختبار تنبيه ماهر هيرو ✅\nوقت الاختبار: ${new Date().toISOString()}\nإذا وصلتك هذه الرسالة فالإشعارات تعمل على جوالك.`,
      cache: "no-store",
    });

    const details = await response.text();

    if (!response.ok) {
      return NextResponse.json(
        {
          ok: false,
          stage: "ntfy",
          status: response.status,
          error: details.slice(0, 500),
        },
        { status: 502 },
      );
    }

    let result: unknown = details;
    try {
      result = JSON.parse(details);
    } catch {
      // ntfy may return plain text in some configurations.
    }

    return NextResponse.json({
      ok: true,
      channel: "ntfy",
      topicConfigured: true,
      server,
      result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        stage: "network",
        error: error instanceof Error ? error.message : "فشل غير معروف أثناء إرسال التنبيه.",
      },
      { status: 502 },
    );
  }
}
