import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

  const response = await fetch(server, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      topic,
      title: "ماهر هيرو — اختبار الإشعارات",
      message: "تم ربط إشعارات ماهر هيرو بجوالك بنجاح. سيصل التنبيه فقط عند ظهور فرصة 95/100 أو أعلى.",
      priority: 4,
      tags: ["white_check_mark", "chart_with_upwards_trend"],
      click: siteUrl,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const details = await response.text();
    return NextResponse.json(
      { ok: false, error: `فشل إرسال الاختبار (${response.status}): ${details.slice(0, 250)}` },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    channel: "ntfy",
    message: "تم إرسال إشعار الاختبار.",
    timestamp: new Date().toISOString(),
  });
}
