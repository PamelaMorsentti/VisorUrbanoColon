import { Router, type IRouter } from "express";
import healthRouter from "./health.ts";
import hydrologyRouter from "./hydrology.ts";
import layerCatalogRouter from "./layerCatalog.ts";
import obrasRouter from "./obras.ts";

const router: IRouter = Router();

router.use(healthRouter);
router.use(hydrologyRouter);
router.use(layerCatalogRouter);
router.use(obrasRouter);

export default router;
