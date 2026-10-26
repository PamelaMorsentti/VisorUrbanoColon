import { Router, type IRouter } from "express";
import healthRouter from "./health.ts";

const router: IRouter = Router();

router.use(healthRouter);

if (process.env["DATABASE_URL"]) {
	const { default: hydrologyRouter } = await import("./hydrology.ts");
	const { default: layerCatalogRouter } = await import("./layerCatalog.ts");
	const { default: obrasRouter } = await import("./obras.ts");
	const { default: qaRouter } = await import("./qa.ts");
	const { default: tramitesRouter } = await import("./tramites/matriculas.ts");

	router.use(hydrologyRouter);
	router.use(layerCatalogRouter);
	router.use(obrasRouter);
	router.use(qaRouter);
	router.use(tramitesRouter);
} else {
	const { default: layerCatalogFeatureInfoLiteRouter } = await import("./layerCatalogFeatureInfoLite.ts");
	router.use(layerCatalogFeatureInfoLiteRouter);
}

export default router;
