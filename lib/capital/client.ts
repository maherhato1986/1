const LIVE_BASE = "https://api-capital.backend-capital.com/api/v1";
const DEMO_BASE = "https://demo-api-capital.backend-capital.com/api/v1";

type SessionTokens = { cst: string; securityToken: string; expiresAt: number };
type CapitalMethod = "GET" | "POST" | "PUT" | "DELETE";

declare global {
  // eslint-disable-next-line no-var
  var capitalSession: SessionTokens | undefined;
  // eslint-disable-next-line no-var
  var capitalSessionPromise: Promise<SessionTokens> | undefined;
}

function config() {
  const apiKey = process.env.CAPITAL_API_KEY;
  const identifier = process.env.CAPITAL_IDENTIFIER;
  const password = process.env.CAPITAL_API_PASSWORD;
  if (!apiKey || !identifier || !password) {
    throw new Error("إعدادات Capital API غير مكتملة على الخادم.");
  }
  return {
    apiKey,
    identifier,
    password,
    base: process.env.CAPITAL_DEMO === "false" ? LIVE_BASE : DEMO_BASE,
  };
}

async function createSession(): Promise<SessionTokens> {
  const { apiKey, identifier, password, base } = config();
  const response = await fetch(`${base}/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CAP-API-KEY": apiKey },
    body: JSON.stringify({ identifier, password, encryptedPassword: false }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`فشل تسجيل الدخول إلى Capital (${response.status}).`);
  const cst = response.headers.get("cst");
  const securityToken = response.headers.get("x-security-token");
  if (!cst || !securityToken) throw new Error("لم ترجع Capital رموز الجلسة المطلوبة.");
  const session = { cst, securityToken, expiresAt: Date.now() + 8 * 60_000 };
  globalThis.capitalSession = session;
  return session;
}

async function session() {
  const cached = globalThis.capitalSession;
  if (cached && cached.expiresAt > Date.now()) return cached;
  if (globalThis.capitalSessionPromise) return globalThis.capitalSessionPromise;
  globalThis.capitalSessionPromise = createSession().finally(() => {
    globalThis.capitalSessionPromise = undefined;
  });
  return globalThis.capitalSessionPromise;
}

export async function capitalRequest<T>(path: string, options?: { method?: CapitalMethod; body?: unknown; retry?: boolean }): Promise<T> {
  const { apiKey, base } = config();
  const tokens = await session();
  const response = await fetch(`${base}${path}`, {
    method: options?.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      "X-CAP-API-KEY": apiKey,
      CST: tokens.cst,
      "X-SECURITY-TOKEN": tokens.securityToken,
    },
    body: options?.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store",
    signal: AbortSignal.timeout(18_000),
  });
  if ((response.status === 401 || response.status === 403) && options?.retry !== false) {
    globalThis.capitalSession = undefined;
    return capitalRequest<T>(path, { ...options, retry: false });
  }
  const text = await response.text();
  if (!response.ok) throw new Error(`Capital API (${response.status}): ${text.slice(0, 220)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

export function capitalMode() {
  return process.env.CAPITAL_DEMO === "false" ? "live" : "demo";
}

export function capitalConfigured() {
  return Boolean(process.env.CAPITAL_API_KEY && process.env.CAPITAL_IDENTIFIER && process.env.CAPITAL_API_PASSWORD);
}
