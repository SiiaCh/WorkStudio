export class AppError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) { super(message); }
}

export function logFailure(event: string, error: unknown): void {
  const value = error as { name?: unknown; code?: unknown };
  // Messages, URLs, bodies and headers can contain credentials.
  console.error(JSON.stringify({
    event,
    type: typeof value?.name === "string" ? value.name : "Error",
    code: typeof value?.code === "string" ? value.code : undefined,
  }));
}
