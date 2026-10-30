import { z } from "zod";

export const databaseUrlSchema = z.string().superRefine((value, ctx) => {
  try {
    const url = new URL(value);
    if (!["postgresql:", "postgres:"].includes(url.protocol) ||
        (process.env.NODE_ENV === "test"
          ? !/^\/workstudio_test_[a-f0-9]{32}$/.test(decodeURIComponent(url.pathname))
          : decodeURIComponent(url.pathname) !== "/workstudio_db") ||
        (url.searchParams.has("schema") && url.searchParams.get("schema") !== "public")) throw new Error();
  } catch {
    ctx.addIssue({ code: "custom", message: "DATABASE_URL must target workstudio_db/public, or an isolated workstudio_test_<32 hex characters>/public database in NODE_ENV=test." });
  }
});
