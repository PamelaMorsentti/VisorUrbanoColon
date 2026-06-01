import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { Client } from "pg";

const sqlArg = process.argv[2];

if (!sqlArg) {
  console.error("Usage: node run-sql.mjs <sql-file-path>");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required in environment");
  process.exit(1);
}

const fullPath = path.resolve(process.cwd(), sqlArg);
const sql = await fs.readFile(fullPath, "utf8");

const client = new Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();
  await client.query(sql);
  console.log(`OK: executed ${fullPath}`);
} catch (error) {
  console.error(`Error executing ${fullPath}`);
  console.error(error);
  process.exitCode = 1;
} finally {
  await client.end();
}
