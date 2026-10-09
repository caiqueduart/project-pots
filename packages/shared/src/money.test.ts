import { describe, expect, it } from "vitest";
import { formatCents, parseCents } from "./money.ts";

describe("parseCents", () => {
  it("lê valores digitados em pt-BR", () => {
    expect(parseCents("1.500,00")).toBe(150000);
    expect(parseCents("75,99")).toBe(7599);
    expect(parseCents("75,9")).toBe(7590);
    expect(parseCents("12")).toBe(1200);
    expect(parseCents("R$ 637,15")).toBe(63715);
    expect(parseCents("75.99")).toBe(7599);
    expect(parseCents("1.500")).toBe(150000);
  });
  it("recusa texto que não é valor", () => {
    expect(parseCents("abc")).toBeNull();
    expect(parseCents("1,234")).toBeNull();
    expect(parseCents("")).toBeNull();
  });
});

describe("formatCents", () => {
  it("formata em reais", () => {
    expect(formatCents(150000).replace(/\s/g, " ")).toBe("R$ 1.500,00");
  });
});
