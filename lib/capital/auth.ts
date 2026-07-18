import { timingSafeEqual } from "node:crypto";

export function authorized(request: Request) {
  const expected = process.env.CAPITAL_BOT_TOKEN;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected || !supplied) return false;
  const left = Buffer.from(expected), right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right);
}

