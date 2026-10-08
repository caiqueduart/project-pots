// Dinheiro trafega sempre em centavos inteiros (R$ 1.500,00 = 150000).
// Estas funções existem só para a apresentação no front.

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatCents(cents: number): string {
  return brl.format(cents / 100);
}

/** Converte o que a pessoa digitou ("1.500,00", "75,9", "12") em centavos. Retorna null se não for um valor. */
export function parseCents(input: string): number | null {
  const clean = input.replace(/[R$\s]/g, "");
  if (!/^\d{1,3}(\.\d{3})*(,\d{0,2})?$|^\d+(,\d{0,2})?$/.test(clean)) return null;
  const [int = "0", frac = ""] = clean.replace(/\./g, "").split(",");
  return Number(int) * 100 + Number(frac.padEnd(2, "0"));
}
