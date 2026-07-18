import { NextResponse } from "next/server";
import { authorized } from "@/lib/capital/auth";
import { capitalRequest } from "@/lib/capital/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" };
type PositionsResponse = { positions?: Array<{ position: Record<string, unknown>; market: Record<string, unknown> }> };
type OrdersResponse = { workingOrders?: Array<{ workingOrderData: Record<string, unknown>; marketData: Record<string, unknown> }> };

export function OPTIONS() { return new NextResponse(null, { status: 204, headers: cors }); }

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "غير مصرح." }, { status: 401, headers: cors });
  try {
    const [positions, orders] = await Promise.all([
      capitalRequest<PositionsResponse>("/positions"),
      capitalRequest<OrdersResponse>("/workingorders"),
    ]);
    return NextResponse.json({ positions: positions.positions ?? [], workingOrders: orders.workingOrders ?? [], timestamp: new Date().toISOString() }, { headers: { ...cors, "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر جلب المحفظة." }, { status: 502, headers: cors });
  }
}
