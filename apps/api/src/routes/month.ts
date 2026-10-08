import { isMonthKey, planningPreviewSchema, purchasePreviewSchema } from "@pots/shared";
import { previewPlanning, previewPurchase } from "../core/index.ts";
import { currentMonthFor, getMonth } from "../services/months.ts";
import { apiError, type Deps, router, validate } from "./context.ts";

export function monthRoutes({ db }: Deps) {
  return router()
    .get("/mes/:month", (c) => {
      const month = c.req.param("month");
      if (!isMonthKey(month)) throw apiError(400, "dados_invalidos", "Use o formato YYYY-MM");
      const result = getMonth(db, c.get("userId"), month, c.get("now"));
      if ("notFound" in result) throw apiError(404, "mes_sem_dados", "Não há registro deste mês");
      return c.json(result.view);
    })
    .post("/previa/compra", validate("json", purchasePreviewSchema), (c) =>
      c.json(previewPurchase(c.req.valid("json"), currentMonthFor(db, c.get("userId"), c.get("now")))),
    )
    .post("/previa/planejamento", validate("json", planningPreviewSchema), (c) =>
      c.json(previewPlanning(c.req.valid("json"))),
    );
}
