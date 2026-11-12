const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000/api";
let accessToken: string | null = localStorage.getItem("ws-access-token");
export function setAccessToken(token: string | null) {
  accessToken = token;
  if (token) localStorage.setItem("ws-access-token", token);
  else localStorage.removeItem("ws-access-token");
}
export function getAccessToken() { return accessToken; }
export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  const body = await response.json().catch(() => null) as { data?: T; error?: { code?: string; message?: string } } | null;
  if (!response.ok) {
    const error = new Error(body?.error?.message ?? `API request failed (${response.status}).`) as Error & { code?: string; status?: number };
    error.code = body?.error?.code; error.status = response.status; throw error;
  }
  return (body?.data ?? body) as T;
}
export function idempotencyHeaders() { return { "Idempotency-Key": crypto.randomUUID() }; }
