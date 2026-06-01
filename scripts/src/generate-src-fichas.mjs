import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(scriptDir, "..", "..");
const DOCS_DIR = path.join(ROOT, "docs");
const OUTPUT = path.join(DOCS_DIR, "FICHAS-TECNICAS-SRC.md");

const INCLUDE_DIRS = [
  "artifacts/colon-3d/src",
  "artifacts/api-server/src",
  "artifacts/mockup-sandbox/src",
  "lib/db/src",
  "lib/api-zod/src",
  "lib/api-client-react/src",
  "scripts/src",
];

const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs"]);

function toPosix(value) {
  return value.split(path.sep).join("/");
}

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function walk(dir, acc) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, acc);
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (!EXTENSIONS.has(ext)) continue;
    acc.push(full);
  }
}

function extractSummary(content) {
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith("//")) return t.replace(/^\/\//, "").trim();
    if (t.startsWith("/*") || t.startsWith("*")) {
      return t.replace(/^\/\*+/, "").replace(/^\*+/, "").replace(/\*\/$/, "").trim();
    }
    break;
  }
  return "Sin descripcion inline.";
}

function extractExports(content) {
  const exports = new Set();
  const patterns = [
    /export\s+default\s+([A-Za-z0-9_]+)/g,
    /export\s+(?:const|let|var|function|class|type|interface|enum)\s+([A-Za-z0-9_]+)/g,
    /export\s*\{\s*([^}]+)\s*\}/g,
  ];

  for (const pattern of patterns) {
    let m;
    while ((m = pattern.exec(content)) !== null) {
      if (!m[1]) continue;
      if (m[1].includes(",")) {
        for (const part of m[1].split(",")) {
          const name = part.trim().split(/\s+as\s+/i)[0].trim();
          if (name) exports.add(name);
        }
      } else {
        exports.add(m[1].trim());
      }
    }
  }

  return Array.from(exports).slice(0, 20);
}

function extractImportStats(content) {
  const importRe = /^\s*import\s+.*?from\s+["']([^"']+)["']/gm;
  let total = 0;
  let external = 0;
  let local = 0;
  let m;
  while ((m = importRe.exec(content)) !== null) {
    total += 1;
    const source = m[1];
    if (source.startsWith(".") || source.startsWith("@/")) {
      local += 1;
    } else {
      external += 1;
    }
  }
  return { total, external, local };
}

async function main() {
  const files = [];
  for (const rel of INCLUDE_DIRS) {
    const abs = path.join(ROOT, rel);
    if (!(await exists(abs))) continue;
    await walk(abs, files);
  }

  files.sort((a, b) => toPosix(path.relative(ROOT, a)).localeCompare(toPosix(path.relative(ROOT, b))));

  const sections = [];
  sections.push("# Fichas Tecnicas por Archivo de src");
  sections.push("");
  sections.push("Documento autogenerado para mantenimiento. Para regenerar:");
  sections.push("");
  sections.push("- `pnpm --filter @workspace/scripts run docs:fichas-src`");
  sections.push("");
  sections.push(`Total de archivos analizados: ${files.length}`);
  sections.push("");

  for (const file of files) {
    const rel = toPosix(path.relative(ROOT, file));
    const content = await fs.readFile(file, "utf8");
    const lineCount = content.split(/\r?\n/).length;
    const summary = extractSummary(content);
    const exports = extractExports(content);
    const importStats = extractImportStats(content);

    sections.push(`## ${rel}`);
    sections.push("");
    sections.push(`- Lineas: ${lineCount}`);
    sections.push(`- Resumen: ${summary}`);
    sections.push(`- Imports: total ${importStats.total} | externos ${importStats.external} | locales ${importStats.local}`);
    sections.push(`- Exports: ${exports.length > 0 ? exports.join(", ") : "sin exports explicitos"}`);
    sections.push("");
  }

  await fs.mkdir(DOCS_DIR, { recursive: true });
  await fs.writeFile(OUTPUT, sections.join("\n"), "utf8");
  console.log(`Fichas generadas en: ${OUTPUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
