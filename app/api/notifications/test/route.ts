import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const topic = process.env.NTFY_TOPIC;
  const server = (process.env.NTFY_SERVER || "https://ntfy.sh").replace(/\/$/, "");
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://1-ten-sage-17.vercel.app";

  if (!topic) {
    return NextResponse.json(
      { ok: false, error: "NTFY_TOPIC غير موجود في Vercel." },
      { status: 500 },
    );
  }

  const response = await fetch(`${server}/${encodeURIComponent(topic)}`, {
    method: "POST",
    headers: {
      Title: "اختبار ماهر هيرو",
      Priority: "high",
      Tags: "white_check_mark,chart_with_upwards_trend",
      Click: siteUrl,
      "Content-Type": "text/plain; charset=utf-8",
    },
    body: "تم نجاح اختبار تنبيه ماهر هيرو ✅\nإذا وصلتك هذه الرسالة فالإشعارات تعمل على جوالك.",
    cache: "no-store",
  });

  if (!response.ok) {
    const details = await response.text();
    return NextResponse.json(
      { ok: false, status: response.status, error: details.slice(0, 300) },
      { status: 502 },
    );
  }

  const result = await response.json();
  return NextResponse.json({ ok: true, channel: "ntfy", result });
}
