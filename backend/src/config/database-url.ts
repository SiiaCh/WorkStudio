import { z } from "zod";

export const databaseUrlSchema = z.string().superRefine((value, ctx) => {
  try {
    const url = new URL(value);
    if (!["postgresql:", "postgres:"].includes(url.protocol) ||
        decodeURIComponent(url.pathname) !== "/workstudio_db" ||
        (url.searchParams.has("schema") && url.searchParams.get("schema") !== "public")) throw new Error();
  } catch {
    ctx.addIssue({ code: "custom", message: "DATABASE_URL must target the PostgreSQL workstudio_db database (public schema)." });
  }
});
