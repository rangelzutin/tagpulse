import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1),
  FRONTEND_URL: z.url(),
  TAGPLUS_BASE_URL: z.url(),
  TAGPLUS_API_VERSION: z.string().min(1),
  TAGPLUS_ACCESS_TOKEN: z.string().min(1).optional(),
  TAGPLUS_CLIENT_ID: z.string().min(1),
  TAGPLUS_CLIENT_SECRET: z.string().min(1),
  TAGPLUS_AUTH_URL: z.url(),
  TAGPLUS_CALLBACK_URL: z.url(),
  TAGPLUS_SCOPES: z.string().min(1).default("read:clientes"),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return envSchema.parse(source);
}
