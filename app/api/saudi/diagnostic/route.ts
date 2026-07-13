import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const testPaths = [
  "",
  "/health",
  "/status",
  "/quote/1120",
  "/quotes/1120",
  "/stocks/1120",
];

function redact(value: string) {
  return value
    .replace(/(api[_-]?key|token|authorization)["'\s:=]+[^\s,"'}]+/gi, "$1:[redacted]")
    .slice(0, 500);
}

export async function GET() {
  const apiKey = process.env.SAHMK_API_KEY;
  const rawBaseUrl = process.env.SAHMK_BASE_URL;

  if (!apiKey || !rawBaseUrl) {
    return NextResponse.json(
      {
        ok: false,
        error: "أضف SAHMK_API_KEY وSAHMK_BASE_URL في Vercel ثم أعد النشر.",
      },
      { status: 500 },
    );
  }

  let baseUrl: URL;
  try {
    baseUrl = new URL(rawBaseUrl.replace(/\/$/, ""));
  } catch {
    return NextResponse.json(
      { ok: false, error: "قيمة SAHMK_BASE_URL ليست رابطًا صحيحًا." },
      { status: 500 },
    );
  }

  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${apiKey}`,
    "X-API-Key": apiKey,
    "x-api-key": apiKey,
  };

  const results = [];
  for (const path of testPaths) {
    const url = `${baseUrl.toString().replace(/\/$/, "")}${path}`;
    try {
      const response = await fetch(url, {
        method: "GET",
        headers,
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
      const body = await response.text();
      results.push({
        path: path || "/",
        status: response.status,
        ok: response.ok,
        contentType: response.headers.get("content-type"),
        preview: redact(body),
      });
      if (response.ok) break;
    } catch (error) {
      results.push({
        path: path || "/",
        status: 0,
        ok: false,
        preview: error instanceof Error ? error.message : "تعذر الاتصال",
      });
    }
  }

  return NextResponse.json({
    ok: results.some((item) => item.ok),
    provider: "sahmk",
    baseHost: baseUrl.host,
    keyConfigured: true,
    results,
    note: "هذا الفحص لا يعرض مفتاح API ولا ينفذ أي تداول.",
    timestamp: new Date().toISOString(),
  });
}
