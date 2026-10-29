import "dotenv/config";
import { defineConfig } from "prisma/config";
import { databaseUrlSchema } from "./src/config/database-url.js";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // Schema generation and validation need no credentials; database commands do.
  datasource: { url: process.env.DATABASE_URL ? databaseUrlSchema.parse(process.env.DATABASE_URL) : undefined },
});
