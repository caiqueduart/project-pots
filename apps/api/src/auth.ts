import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { Db } from "./db/client.ts";
import * as schema from "./db/schema.ts";

export interface AuthConfig {
  baseURL: string;
  secret: string;
  googleClientId: string;
  googleClientSecret: string;
  trustedOrigins: string[];
}

export function createAuth(db: Db, cfg: AuthConfig) {
  return betterAuth({
    baseURL: cfg.baseURL,
    basePath: "/api/auth",
    secret: cfg.secret,
    trustedOrigins: cfg.trustedOrigins,
    database: drizzleAdapter(db, {
      provider: "sqlite",
      usePlural: true,
      schema: {
        users: schema.users,
        sessions: schema.sessions,
        accounts: schema.accounts,
        verifications: schema.verifications,
      },
    }),
    // só login com Google: pedimos nome, e-mail e foto
    socialProviders: {
      google: { clientId: cfg.googleClientId, clientSecret: cfg.googleClientSecret, prompt: "select_account" },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
    },
    advanced: {
      useSecureCookies: cfg.baseURL.startsWith("https://"),
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;

/** O que a API precisa do login: descobrir o usuário da requisição e atender as rotas /api/auth/*. */
export interface AuthPort {
  handler(req: Request): Promise<Response>;
  getUserId(headers: Headers): Promise<string | null>;
}

export function authPort(auth: Auth): AuthPort {
  return {
    handler: (req) => auth.handler(req),
    async getUserId(headers) {
      const session = await auth.api.getSession({ headers });
      return session?.user.id ?? null;
    },
  };
}
