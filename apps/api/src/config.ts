import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().int().default(3000),
  DATABASE_PATH: z.string().default("./data/pots.db"),
  MIGRATIONS_DIR: z.string().optional(),
  // endereço público do app (o Google exige domínio); front e API ficam no mesmo endereço
  APP_URL: z.url(),
  BETTER_AUTH_SECRET: z.string().min(32, "Gere com: openssl rand -base64 32"),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Configuração inválida:\n${msg}`);
  }
  return parsed.data;
}
