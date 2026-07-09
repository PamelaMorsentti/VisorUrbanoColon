import { Router, type IRouter } from "express";
import healthRouter from "./health.ts";
import hydrologyRouter from "./hydrology.ts";
import layerCatalogRouter from "./layerCatalog.ts";
import obrasRouter from "./obras.ts";
import qaRouter from "./qa.ts";
import tramitesRouter from "./tramites/matriculas.ts";

const router: IRouter = Router();

router.use(healthRouter);
router.use(hydrologyRouter);
router.use(layerCatalogRouter);
router.use(obrasRouter);
router.use(qaRouter);
router.use(tramitesRouter);

export default router;
