import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";
import { assertSafeDatabaseUrl } from "../database/guard.js";

// Load environment configuration safely:
// When NOT in production, prioritize .env.development to guarantee dev database isolation.
const nodeEnv = process.env.NODE_ENV || "development";
if (nodeEnv !== "production") {
  const candidateDevPaths = [
    path.resolve(process.cwd(), ".env.development"),
    path.resolve(process.cwd(), "backend", ".env.development"),
  ];
  for (const p of candidateDevPaths) {
    if (fs.existsSync(p)) {
      dotenv.config({ path: p, override: true });
      break;
    }
  }
}
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1),
  TEST_DATABASE_URL: z.string().min(1).optional(),
  FRONTEND_URL: z.url(),
  TAGPLUS_BASE_URL: z.url(),
  TAGPLUS_API_VERSION: z.string().min(1),
  TAGPLUS_ACCESS_TOKEN: z.string().min(1).optional(),
  TAGPLUS_CLIENT_ID: z.string().min(1),
  TAGPLUS_CLIENT_SECRET: z.string().min(1),
  TAGPLUS_AUTH_URL: z.url(),
  TAGPLUS_CALLBACK_URL: z.url(),
  TAGPLUS_SCOPES: z
    .string()
    .min(1)
    .default(
      "read:clientes read:produtos read:pedidos read:vendas_simples read:nfes read:categorias",
    ),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.parse(source);
  assertSafeDatabaseUrl(parsed.DATABASE_URL, parsed.NODE_ENV);
  assertSafeDatabaseUrl(parsed.DIRECT_URL, parsed.NODE_ENV);
  return parsed;
}

