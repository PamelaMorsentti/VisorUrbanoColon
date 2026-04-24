import { Router, type IRouter } from "express";
import healthRouter from "./health.ts";
import hydrologyRouter from "./hydrology.ts";
import layerCatalogRouter from "./layerCatalog.ts";

const router: IRouter = Router();

router.use(healthRouter);
router.use(hydrologyRouter);
router.use(layerCatalogRouter);

export default router;
