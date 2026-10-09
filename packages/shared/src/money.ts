// Dinheiro trafega sempre em centavos inteiros (R$ 1.500,00 = 150000).
// Estas funções existem só para a apresentação no front.

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatCents(cents: number): string {
  return brl.format(cents / 100);
}

/**
 * Converte o que a pessoa digitou ("1.500,00", "75,9", "12", "75.99") em centavos.
 * Retorna null se não for um valor.
 */
export function parseCents(input: string): number | null {
  let clean = input.replace(/[R$\s]/g, "");
  // "75.99" (ponto como decimal, comum no teclado numérico do celular)
  if (/^\d+\.\d{1,2}$/.test(clean)) clean = clean.replace(".", ",");
  if (!/^\d{1,3}(\.\d{3})*(,\d{0,2})?$|^\d+(,\d{0,2})?$/.test(clean)) return null;
  const [int = "0", frac = ""] = clean.replace(/\./g, "").split(",");
  return Number(int) * 100 + Number(frac.padEnd(2, "0"));
}

/** Valor para preencher um campo de edição: 150000 → "1500,00". */
export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}
