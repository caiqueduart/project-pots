import { zValidator as zv } from "@hono/zod-validator";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ZodType } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import * as t from "../db/schema.ts";

export interface Deps {
  db: Db;
  now: () => Date;
}

export type Env = { Variables: { userId: string; now: Date } };

export const router = () => new Hono<Env>();

export function apiError(status: ContentfulStatusCode, code: string, message: string): HTTPException {
  return new HTTPException(status, {
    res: new Response(JSON.stringify({ error: { code, message } }), {
      status,
      headers: { "content-type": "application/json" },
    }),
  });
}

/** Validação com zod devolvendo o erro no formato da API. */
export function validate<T extends ZodType, Target extends "json" | "query" | "param">(target: Target, schema: T) {
  return zv(target, schema, (result) => {
    if (!result.success) {
      const issue = result.error.issues[0];
      const where = issue?.path.length ? `${issue.path.join(".")}: ` : "";
      throw apiError(400, "dados_invalidos", `${where}${issue?.message ?? "Dados inválidos"}`);
    }
  });
}

export function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw apiError(404, "nao_encontrado", "Registro não encontrado");
  return id;
}

export const notFound = () => apiError(404, "nao_encontrado", "Registro não encontrado");

/** O pote precisa ser do usuário e estar ativo para receber compras ou fixos. */
export function assertActivePot(db: Db, userId: string, potId: number): void {
  const pot = db
    .select({ id: t.pots.id })
    .from(t.pots)
    .where(and(eq(t.pots.id, potId), eq(t.pots.userId, userId), isNull(t.pots.archivedAt)))
    .get();
  if (!pot) throw apiError(400, "pote_invalido", "Pote não encontrado");
}
