import { Router, type IRouter } from "express";
import healthRouter from "./health.ts";
import hydrologyRouter from "./hydrology.ts";

const router: IRouter = Router();

router.use(healthRouter);
router.use(hydrologyRouter);

export default router;
