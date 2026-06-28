import { config } from "dotenv";

import { defineConfig, env } from "prisma/config";

// Next.js convention is `.env.local` (gitignored); fall back to `.env`.
// Real environment variables (CI/Vercel) win — dotenv never overrides what is
// already set in process.env, so loading both files here is safe everywhere.
config({ path: ".env.local" });
config();

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts"
  },
  datasource: {
    url: env("DATABASE_URL")
  }
});
