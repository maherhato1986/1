import { NextResponse } from "next/server";

function authorize(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const topic = process.env.NTFY_TOPIC;
  const server = (process.env.NTFY_SERVER || "https://ntfy.sh").replace(/\/$/, "");
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://1-ten-sage-17.vercel.app";

  if (!topic) {
    return NextResponse.json(
      { ok: false, error: "أضف NTFY_TOPIC في Vercel أولًا." },
      { status: 400 },
    );
  }

  const response = await fetch(`${server}/${encodeURIComponent(topic)}`, {
    method: "POST",
    headers: {
      Title: "ماهر هيرو — اختبار الإشعارات",
      Priority: "high",
      Tags: "white_check_mark,chart_with_upwards_trend",
      Click: siteUrl,
      "Content-Type": "text/plain; charset=utf-8",
    },
    body: "تم ربط إشعارات ماهر هيرو بجوالك بنجاح. سيصل التنبيه فقط عند ظهور فرصة 95/100 أو أعلى.",
  });

  if (!response.ok) {
    const details = await response.text();
    return NextResponse.json(
      { ok: false, error: `فشل إرسال الاختبار (${response.status}): ${details.slice(0, 250)}` },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, channel: "ntfy", message: "تم إرسال إشعار الاختبار." });
}
