import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1),
  EVOLUTION_API_URL: z.string().url(),
  EVOLUTION_API_KEY: z.string().min(1),
  EVOLUTION_INSTANCE: z.string().min(1),
  WEBHOOK_SECRET: z.string().min(16),
  ELEVENLABS_API_KEY: z.string().min(1),
  GEMINI_API_KEY: z.string().min(1),
  MASTER_ENCRYPTION_KEY: z.string().length(64),
  PORT: z.string().default("3200"),
});

type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

function getEnv(): Env {
  if (!_env) {
    _env = envSchema.parse(process.env);
  }
  return _env;
}

export const env = new Proxy({} as Env, {
  get(_, prop: string) {
    return getEnv()[prop as keyof Env];
  },
});
