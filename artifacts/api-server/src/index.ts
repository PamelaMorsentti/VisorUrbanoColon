import "dotenv/config";
import app from "./app.ts";
import { logger } from "./lib/logger.ts";
import { startHealthCheckScheduler } from "./lib/layerHealthChecker.ts";

const rawPort = process.env["PORT"] ?? "5180";

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  startHealthCheckScheduler();
});
