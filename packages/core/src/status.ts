import type { LimitStatus, PotKind, PotStatus } from "@pots/shared";

/**
 * Faixa de aviso contra um teto, em inteiros:
 * - acima do teto: estourou
 * - de warn_pct% até antes do teto: aviso
 * - abaixo disso ou exatamente no teto: ok
 * Sem teto (0), qualquer valor já estoura.
 */
export function limitStatus(used: number, limit: number, warnPct: number): LimitStatus {
  if (limit <= 0) return used > 0 ? "estourou" : "ok";
  if (used > limit) return "estourou";
  if (used < limit && used * 100 >= limit * warnPct) return "aviso";
  return "ok";
}

/** Pote de gasto usa o valor como teto; pote de meta usa como objetivo e nunca estoura. */
export function potStatus(kind: PotKind, used: number, budget: number, warnPct: number): PotStatus {
  if (kind === "meta") return budget > 0 && used >= budget ? "cumprida" : "pendente";
  return limitStatus(used, budget, warnPct);
}

export function pct(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part * 100) / whole) : null;
}
