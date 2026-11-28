const API_BASE_URL = (import.meta.env?.VITE_API_BASE_URL ?? "http://localhost:3000/api").replace(/\/$/, "");
export class ApiError extends Error {
  constructor(message: string, public status: number, public code: string | undefined, public path: string) { super(message); }
}
export function createApiClient(base: string, storage: Pick<Storage, "getItem" | "setItem" | "removeItem">, fetcher: typeof fetch, expired: () => void) {
  const clean = (token: string | null) => token && !["undefined", "null"].includes(token) && !/\s/.test(token) ? token : null;
  let token = clean(storage.getItem("ws-access-token"));
  function setAccessToken(value: string | null) { token = clean(value); if(token) storage.setItem("ws-access-token", token); else storage.removeItem("ws-access-token"); }
  const getAccessToken = () => token;
  async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
    const sentToken = token;
    const headers = new Headers(options.headers);
    if(options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    if(sentToken) headers.set("Authorization", "Bearer " + sentToken);
    const response = await fetcher(base + path, { ...options, headers });
    const body = await response.json().catch(() => null);
    if(!response.ok) {
      // A failed login must not expire another session. Never retry mutations automatically.
      if(response.status === 401 && sentToken && token === sentToken && !["/auth/login", "/auth/register", "/auth/verify-email", "/auth/resend-verification"].includes(path.split("?")[0])) { setAccessToken(null); expired(); }
      const details = Array.isArray(body?.error?.details) ? body.error.details.map((d: {field?:string;message?:string}) => [d.field,d.message].filter(Boolean).join(": ")).join("; ") : "";
      throw new ApiError((body?.error?.message ?? "API request failed") + (details ? " " + details : "") + " (" + (options.method ?? "GET") + " " + path.split("?")[0] + ", HTTP " + response.status + ")", response.status, body?.error?.code, path.split("?")[0]);
    }
    if(sentToken && token !== sentToken) throw new ApiError("Session changed; reload this page.", 409, "SESSION_CHANGED", path.split("?")[0]);
    return (body?.data ?? body) as T;
  }
  return { apiRequest, getAccessToken, setAccessToken };
}
const client = createApiClient(API_BASE_URL, localStorage, (...args) => fetch(...args), () => window.dispatchEvent(new Event("ws-session-expired")));
export const { apiRequest, getAccessToken, setAccessToken } = client;
export function idempotencyHeaders() { return { "Idempotency-Key": crypto.randomUUID() }; }
