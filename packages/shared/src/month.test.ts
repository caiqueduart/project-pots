import { describe, expect, it } from "vitest";
import { addMonths, dateInMonth, diffMonths, isDateKey, isMonthKey } from "./month.ts";

describe("meses", () => {
  it("soma e subtrai atravessando o ano", () => {
    expect(addMonths("2026-10", 3)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(diffMonths("2026-06", "2027-04")).toBe(10);
  });
  it("limita o dia ao fim do mês", () => {
    expect(dateInMonth("2026-02", 31)).toBe("2026-02-28");
    expect(dateInMonth("2028-02", 30)).toBe("2028-02-29");
  });
  it("valida formatos", () => {
    expect(isMonthKey("2026-10")).toBe(true);
    expect(isMonthKey("2026-13")).toBe(false);
    expect(isDateKey("2026-02-30")).toBe(false);
    expect(isDateKey("2026-10-08")).toBe(true);
  });
});
