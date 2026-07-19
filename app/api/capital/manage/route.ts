import { NextResponse } from "next/server";
import { z } from "zod";
import { authorized } from "@/lib/capital/auth";
import { capitalRequest } from "@/lib/capital/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const schema = z.object({
  action: z.enum(["update_position", "close_position", "update_order", "cancel_order"]),
  dealId: z.string().min(1).max(120),
  stopLevel: z.number().positive().optional(),
  profitLevel: z.number().positive().optional(),
  level: z.number().positive().optional(),
  confirmation: z.literal("EXECUTE"),
});

type CapitalResult = { dealReference?: string };

function envEnabled(value: string | undefined) {
  return ["true", "1", "yes", "on"].includes(String(value ?? "").trim().toLowerCase());
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors });
}

export async function POST(request: Request) {
  try {
    if (!authorized(request)) {
      return NextResponse.json({ error: "غير مصرح بالوصول إلى Capital Bot." }, { status: 401, headers: cors });
    }

    if (!envEnabled(process.env.CAPITAL_TRADING_ENABLED)) {
      return NextResponse.json(
        { error: "إدارة الصفقات الحقيقية مقفلة. فعّل CAPITAL_TRADING_ENABLED بعد اختبار الحساب التجريبي." },
        { status: 403, headers: cors },
      );
    }

    const input = schema.parse(await request.json());
    let result: CapitalResult;

    if (input.action === "close_position") {
      result = await capitalRequest<CapitalResult>(`/positions/${encodeURIComponent(input.dealId)}`, { method: "DELETE" });
    } else if (input.action === "cancel_order") {
      result = await capitalRequest<CapitalResult>(`/workingorders/${encodeURIComponent(input.dealId)}`, { method: "DELETE" });
    } else if (input.action === "update_position") {
      if (input.stopLevel === undefined && input.profitLevel === undefined) {
        return NextResponse.json({ error: "أدخل وقفًا أو هدفًا جديدًا على الأقل." }, { status: 400, headers: cors });
      }
      result = await capitalRequest<CapitalResult>(`/positions/${encodeURIComponent(input.dealId)}`, {
        method: "PUT",
        body: {
          guaranteedStop: false,
          ...(input.stopLevel !== undefined ? { stopLevel: input.stopLevel } : {}),
          ...(input.profitLevel !== undefined ? { profitLevel: input.profitLevel } : {}),
        },
      });
    } else {
      if (input.level === undefined && input.stopLevel === undefined && input.profitLevel === undefined) {
        return NextResponse.json({ error: "أدخل مستوى أو وقفًا أو هدفًا جديدًا على الأقل." }, { status: 400, headers: cors });
      }
      result = await capitalRequest<CapitalResult>(`/workingorders/${encodeURIComponent(input.dealId)}`, {
        method: "PUT",
        body: {
          ...(input.level !== undefined ? { level: input.level } : {}),
          ...(input.stopLevel !== undefined ? { stopLevel: input.stopLevel } : {}),
          ...(input.profitLevel !== undefined ? { profitLevel: input.profitLevel } : {}),
        },
      });
    }

    if (!result.dealReference) {
      throw new Error("لم ترجع Capital رقم مرجع للعملية.");
    }

    const confirmation = await capitalRequest(`/confirms/${encodeURIComponent(result.dealReference)}`);
    return NextResponse.json(
      { status: "submitted", action: input.action, dealReference: result.dealReference, confirmation },
      { headers: cors },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "بيانات إدارة الصفقة غير صالحة.", details: error.flatten() }, { status: 400, headers: cors });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "تعذر إدارة الصفقة." },
      { status: 500, headers: cors },
    );
  }
}
