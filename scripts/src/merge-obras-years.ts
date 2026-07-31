import fs from "node:fs";
import path from "node:path";

type JsonObject = Record<string, unknown>;

type Feature = {
  type: "Feature";
  geometry?: {
    type?: string;
    coordinates?: unknown;
  };
  properties?: JsonObject;
};

type FeatureCollection = {
  type: "FeatureCollection";
  features: Feature[];
};

type CliOptions = {
  years: string[];
  sourceDir: string;
  targetDir: string;
};

type Role = "public" | "professional";

type RoleConfig = {
  appFileName: string;
  sourceSuffixes: string[];
};

const ROLE_CONFIG: Record<Role, RoleConfig> = {
  public: {
    appFileName: "obras-public.geojson",
    sourceSuffixes: ["geolocated-public.geojson"],
  },
  professional: {
    appFileName: "obras-professional.geojson",
    sourceSuffixes: ["geolocated-profesionales.geojson"],
  },
};

function fail(message: string): never {
  console.error(`[merge-obras-years] ${message}`);
  process.exit(1);
}

function detectRepoRoot(startDir: string): string {
  let current = startDir;
  for (;;) {
    if (fs.existsSync(path.join(current, "pnpm-workspace.yaml"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return startDir;
    }
    current = parent;
  }
}

function parseArgs(argv: string[]): CliOptions {
  const pairs = new Map<string, string>();

  for (const arg of argv) {
    if (!arg.startsWith("--")) {
      continue;
    }
    const eq = arg.indexOf("=");
    if (eq < 0) {
      pairs.set(arg.slice(2), "true");
      continue;
    }
    pairs.set(arg.slice(2, eq), arg.slice(eq + 1));
  }

  const yearsRaw = (pairs.get("years") ?? "").trim();
  if (!yearsRaw) {
    fail("Missing --years=YYYY[,YYYY...]");
  }

  const years = yearsRaw
    .split(",")
    .map((y) => y.trim())
    .filter((y) => /^\d{4}$/.test(y));

  if (years.length === 0) {
    fail("No valid years found in --years option.");
  }

  const repoRoot = detectRepoRoot(process.cwd());
  const sourceDir = path.resolve(
    repoRoot,
    pairs.get("sourceDir") ?? path.join("artifacts", "planos-cleaning"),
  );
  const targetDir = path.resolve(
    repoRoot,
    pairs.get("targetDir") ?? path.join("artifacts", "colon-3d", "public", "data", "planos"),
  );

  return { years, sourceDir, targetDir };
}

function readJsonFile<T>(filePath: string): T {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw) as T;
}

function writeJsonFile(filePath: string, data: unknown): void {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function getFeatureYear(feature: Feature): string {
  const props = feature.properties ?? {};
  const candidates = [
    props.fecha_de_visado,
    props.fecha_visado,
    props.raw__visado,
    props.ano,
    props.visado_year,
  ];

  for (const candidate of candidates) {
    const text = String(candidate ?? "").trim();
    const match = text.match(/(19|20)\d{2}/);
    if (match) {
      return match[0];
    }
  }

  return "";
}

function buildFeatureKey(feature: Feature): string {
  const props = feature.properties ?? {};
  const coords = Array.isArray(feature.geometry?.coordinates)
    ? feature.geometry?.coordinates
    : [];

  const lon = Array.isArray(coords) ? String(coords[0] ?? "") : "";
  const lat = Array.isArray(coords) ? String(coords[1] ?? "") : "";

  return [
    getFeatureYear(feature),
    String(props.legajo_canonico ?? ""),
    String(props.source_row_number ?? ""),
    String(props.raw_ubicacion ?? ""),
    String(props.ncp_formatted ?? props.ncp ?? ""),
    String(props.tipo ?? ""),
    lon,
    lat,
  ].join("|");
}

function candidateSourceNamesForYear(year: string, suffix: string): string[] {
  return [
    `${year}.fixed.${suffix}`,
    `${year}.${suffix}`,
  ];
}

function resolveYearSourceFile(sourceDir: string, year: string, suffix: string): string {
  const candidates = candidateSourceNamesForYear(year, suffix);
  for (const fileName of candidates) {
    const fullPath = path.join(sourceDir, fileName);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
  }
  fail(`No source file found for year ${year} and suffix ${suffix}. Tried: ${candidates.join(", ")}`);
}

function loadIncomingFeatures(sourceDir: string, years: string[], role: Role): { features: Feature[]; files: string[] } {
  const cfg = ROLE_CONFIG[role];
  const all: Feature[] = [];
  const files: string[] = [];

  for (const year of years) {
    for (const suffix of cfg.sourceSuffixes) {
      const sourceFile = resolveYearSourceFile(sourceDir, year, suffix);
      const fc = readJsonFile<FeatureCollection>(sourceFile);
      const features = Array.isArray(fc.features) ? fc.features : [];
      all.push(...features);
      files.push(sourceFile);
    }
  }

  return { features: all, files };
}

function mergeRole(options: CliOptions, role: Role): void {
  const cfg = ROLE_CONFIG[role];
  const targetPath = path.join(options.targetDir, cfg.appFileName);

  if (!fs.existsSync(targetPath)) {
    fail(`Target file not found: ${targetPath}`);
  }

  const existing = readJsonFile<FeatureCollection>(targetPath);
  const existingFeatures = Array.isArray(existing.features) ? existing.features : [];

  const incoming = loadIncomingFeatures(options.sourceDir, options.years, role);
  const incomingYears = new Set<string>();
  for (const feature of incoming.features) {
    const year = getFeatureYear(feature);
    if (year) {
      incomingYears.add(year);
    }
  }

  const filteredExisting = existingFeatures.filter((feature) => {
    const year = getFeatureYear(feature);
    return !year || !incomingYears.has(year);
  });

  const dedupe = new Set<string>();
  const merged: Feature[] = [];

  for (const feature of filteredExisting) {
    const key = buildFeatureKey(feature);
    dedupe.add(key);
    merged.push(feature);
  }

  let inserted = 0;
  let skipped = 0;
  for (const feature of incoming.features) {
    const key = buildFeatureKey(feature);
    if (dedupe.has(key)) {
      skipped += 1;
      continue;
    }
    dedupe.add(key);
    merged.push(feature);
    inserted += 1;
  }

  const out: FeatureCollection = {
    type: "FeatureCollection",
    features: merged,
  };

  writeJsonFile(targetPath, out);

  const removed = existingFeatures.length - filteredExisting.length;
  console.log(`\n[merge-obras-years] ${role}`);
  console.log(`  target: ${targetPath}`);
  console.log(`  sources:`);
  for (const file of incoming.files) {
    console.log(`    - ${file}`);
  }
  console.log(`  existing before: ${existingFeatures.length}`);
  console.log(`  removed by incoming years: ${removed}`);
  console.log(`  incoming total: ${incoming.features.length}`);
  console.log(`  inserted: ${inserted}`);
  console.log(`  skipped duplicates: ${skipped}`);
  console.log(`  final total: ${merged.length}`);
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(options.sourceDir)) {
    fail(`Source directory not found: ${options.sourceDir}`);
  }
  if (!fs.existsSync(options.targetDir)) {
    fail(`Target directory not found: ${options.targetDir}`);
  }

  mergeRole(options, "public");
  mergeRole(options, "professional");

  console.log("\n[merge-obras-years] Done.");
}

main();
