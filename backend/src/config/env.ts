import "dotenv/config";
import { z } from "zod";
import { databaseUrlSchema } from "./database-url.js";

const optionalText = z.preprocess(value => value === "" ? undefined : value, z.string().optional());
const integer = (fallback: number, min: number, max: number) => z.coerce.number().int().min(min).max(max).default(fallback);
const schema = z.object({
  NODE_ENV: z.enum(["development", "production"]).default("development"),
  HOST: z.string().default("127.0.0.1"),
  PORT: integer(3000, 1, 65535),
  DATABASE_URL: databaseUrlSchema,
  JWT_SECRET: z.string().min(43).refine(value => !value.includes("REPLACE_"), "Generate a random JWT secret."),
  JWT_ISSUER: z.string().min(1).default("workstudio-api"),
  JWT_AUDIENCE: z.string().min(1).default("workstudio-apps"),
  SESSION_TTL_MINUTES: integer(480, 1, 10080),
  SESSION_IDLE_MINUTES: integer(30, 1, 1440),
  BCRYPT_ROUNDS: integer(12, 10, 15),
  LOGIN_MAX_FAILURES: integer(5, 1, 100),
  LOGIN_BLOCK_MINUTES: integer(15, 1, 1440),
  LOGIN_FAILURE_WINDOW_MINUTES: integer(15, 1, 1440),
  EMAIL_VERIFICATION_TTL_MINUTES: integer(1440, 1, 10080),
  EMAIL_TRANSPORT: z.enum(["preview", "smtp"]).default("preview"),
  PUBLIC_API_URL: z.url().default("http://127.0.0.1:3000"),
  CORS_ORIGINS: z.string().default("http://localhost:5173"),
  TRUST_PROXY_HOPS: integer(0, 0, 10),
  TLS_CERT_PATH: optionalText,
  TLS_KEY_PATH: optionalText,
  SMTP_HOST: optionalText,
  SMTP_PORT: integer(587, 1, 65535),
  SMTP_SECURE: z.enum(["true", "false"]).default("false").transform(value => value === "true"),
  SMTP_USER: optionalText,
  SMTP_PASSWORD: optionalText,
  SMTP_FROM: optionalText,
}).superRefine((value, ctx) => {
  const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
  if (!!value.TLS_CERT_PATH !== !!value.TLS_KEY_PATH) issue("TLS_CERT_PATH", "Supply both TLS certificate and key paths.");
  const publicUrl = new URL(value.PUBLIC_API_URL);
  if (!["http:", "https:"].includes(publicUrl.protocol) || publicUrl.username || publicUrl.password || publicUrl.search || publicUrl.hash || publicUrl.pathname !== "/") issue("PUBLIC_API_URL", "Use an HTTP(S) origin without credentials, path, query or fragment.");
  for (const origin of value.CORS_ORIGINS.split(",").map(item => item.trim()).filter(Boolean)) {
    try {
      const parsed = new URL(origin);
      if (!["http:", "https:"].includes(parsed.protocol) || parsed.origin !== origin) throw new Error();
      if (value.NODE_ENV === "production" && parsed.protocol !== "https:") throw new Error();
    } catch { issue("CORS_ORIGINS", "Use comma-separated HTTP(S) origins; production origins require HTTPS."); }
  }
  if (value.EMAIL_TRANSPORT === "smtp") {
    if (!value.SMTP_HOST || !value.SMTP_FROM) issue("SMTP_HOST", "SMTP mode requires SMTP_HOST and SMTP_FROM.");
    if (!!value.SMTP_USER !== !!value.SMTP_PASSWORD) issue("SMTP_USER", "Supply both SMTP user and password, or neither for a trusted relay.");
  }
  if (value.NODE_ENV === "production") {
    if (value.EMAIL_TRANSPORT !== "smtp") issue("EMAIL_TRANSPORT", "Production requires SMTP.");
    if (publicUrl.protocol !== "https:") issue("PUBLIC_API_URL", "Production requires a public HTTPS URL.");
    if (!value.TLS_CERT_PATH && !value.TRUST_PROXY_HOPS) issue("TLS_CERT_PATH", "Production requires direct TLS or a trusted HTTPS reverse proxy.");
  } else if (!value.TLS_CERT_PATH && !["127.0.0.1", "::1", "localhost"].includes(value.HOST)) {
    issue("HOST", "Development HTTP must bind to a loopback host.");
  }
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) throw new Error("Invalid environment configuration: " + parsed.error.issues.map(issue => issue.path.join(".") + ": " + issue.message).join("; "));
export const env = parsed.data;
