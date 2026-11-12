import { createHash, randomBytes } from "node:crypto";
export function hashToken(token: string): string { return createHash("sha256").update(token).digest("hex"); }
export function verificationToken(): string { return randomBytes(32).toString("hex"); }
export const minutes = (value: number): number => value * 60_000;
