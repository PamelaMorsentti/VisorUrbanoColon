import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(scriptDir, "..", "..");
const TEMP_ROOT = path.join(ROOT, "_temporal");
const APPLY = process.argv.includes("--apply");

const ROOT_FILE_PATTERNS = [
  /\.dwg$/i,
  /\.dxf$/i,
  /\.pdf$/i,
  /\.zip$/i,
  /\.bak$/i,
  /\.tmp$/i,
  /\.log$/i,
  /\.csv$/i,
];

const ROOT_FILE_EXACT = new Set([
  ".replit",
  ".replitignore",
  "replit.md",
  "package-lock.json",
]);

const ROOT_DIR_EXACT = new Set([
  ".local",
]);

function tsStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function toPosix(value) {
  return value.split(path.sep).join("/");
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function safeMove(src, destDir) {
  await ensureDir(destDir);
  const base = path.basename(src);
  let target = path.join(destDir, base);
  let i = 1;
  while (true) {
    try {
      await fs.access(target);
      const parsed = path.parse(base);
      target = path.join(destDir, `${parsed.name}-${i}${parsed.ext}`);
      i += 1;
    } catch {
      break;
    }
  }
  await fs.rename(src, target);
  return target;
}

async function listRootEntries() {
  const entries = await fs.readdir(ROOT, { withFileTypes: true });
  return entries.filter((e) => e.name !== "_temporal" && e.name !== ".git" && e.name !== "node_modules");
}

async function collectCandidates() {
  const candidates = [];
  const rootEntries = await listRootEntries();

  for (const entry of rootEntries) {
    const abs = path.join(ROOT, entry.name);
    if (entry.isDirectory() && ROOT_DIR_EXACT.has(entry.name)) {
      candidates.push({ src: abs, bucket: "replit" });
      continue;
    }

    if (entry.isFile()) {
      if (ROOT_FILE_EXACT.has(entry.name)) {
        candidates.push({ src: abs, bucket: "replit" });
        continue;
      }
      if (ROOT_FILE_PATTERNS.some((re) => re.test(entry.name))) {
        candidates.push({ src: abs, bucket: "diseno_fuentes" });
      }
    }
  }

  const scriptSrc = path.join(ROOT, "scripts", "src");
  try {
    const scriptEntries = await fs.readdir(scriptSrc, { withFileTypes: true });
    for (const entry of scriptEntries) {
      if (!entry.isFile()) continue;
      if (!/^_.*\.(mjs|js|ts)$/i.test(entry.name)) continue;
      candidates.push({ src: path.join(scriptSrc, entry.name), bucket: "scripts_auxiliares" });
    }
  } catch {
    // ignore if scripts/src does not exist
  }

  return candidates;
}

async function main() {
  const candidates = await collectCandidates();
  if (candidates.length === 0) {
    console.log("No hay archivos temporales para archivar.");
    return;
  }

  const runDir = path.join(TEMP_ROOT, "auto-archive", tsStamp());
  console.log(`Modo: ${APPLY ? "APPLY" : "DRY-RUN"}`);
  console.log(`Candidatos: ${candidates.length}`);

  for (const c of candidates) {
    const rel = toPosix(path.relative(ROOT, c.src));
    const dest = path.join(runDir, c.bucket);
    const destPreview = toPosix(path.relative(ROOT, path.join(dest, path.basename(c.src))));

    if (!APPLY) {
      console.log(`[DRY] ${rel} -> ${destPreview}`);
      continue;
    }

    const movedTo = await safeMove(c.src, dest);
    console.log(`[MOVE] ${rel} -> ${toPosix(path.relative(ROOT, movedTo))}`);
  }

  if (!APPLY) {
    console.log("\nPara aplicar los movimientos: pnpm --filter @workspace/scripts run maint:archive-temp");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
