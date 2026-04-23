/**
 * Patch: improve normalizeAddressForQuery + buildAddressQueries
 * Fixes:
 *  1. "Pte.Perón" (no space after dot) → "Presidente Perón"
 *  2. Stripping leading street-type prefixes (Boulevard/Avenida/General) as fallback
 *  3. Extracting clean primary street name from cornerMatch (strip numbers)
 *  4. Multi-number "NNN y NNN" or "NNN, NNN" → use only first number
 *  5. Last-word surname fallback so "Boulevard Güemes 168" → also try "Güemes 168"
 */
import { readFileSync, writeFileSync } from "fs";

const f = new URL("./src/geolocate-planos-catastro.ts", import.meta.url)
  .pathname.replace(/^\/([A-Z]:)/, "$1"); // strip leading slash on Windows

let c = readFileSync(f, "utf8");

// ─────────────────────────────────────────────────────────────────
// 1. Fix Pte. expansion when immediately followed by word (no space)
//    Before: \bPte\.?(?=[\s,]|$)
//    After:  \bPte\.?\s* (consume the dot and any trailing space, always expand)
// ─────────────────────────────────────────────────────────────────
const OLD_PTE = `.replace(/\\bPte\\.?(?=[\\s,]|$)/gi, "Presidente")`;
const NEW_PTE = `.replace(/\\bPte\\.?\\s*/gi, "Presidente ")`;
if (!c.includes(OLD_PTE)) { console.error("PTE not found"); process.exit(1); }
c = c.replace(OLD_PTE, NEW_PTE);
console.log("1. Fixed Pte. expansion.");

// ─────────────────────────────────────────────────────────────────
// 2. Improve cornerMatch block: strip numbers from primary,
//    add prefix-stripped fallback, add surname-only fallback
// ─────────────────────────────────────────────────────────────────
const OLD_CORNER = `  if (cornerMatch) {
    const primary = normalizeWhitespace(cornerMatch[1]);
    const crossing = normalizeWhitespace(cornerMatch[2]).replace(/^\\.?\\s*/, "");
    if (primary && crossing) {
      queryCandidates.push(\`\${primary} y \${crossing}, Colón\`);
    }
    if (primary && firstNumber) {
      queryCandidates.push(\`\${primary} \${firstNumber}, Colón\`);
    }
    if (primary) {
      queryCandidates.push(\`\${primary}, Colón\`);
    }
  } else {`;

const NEW_CORNER = `  if (cornerMatch) {
    const primary = normalizeWhitespace(cornerMatch[1]);
    // Strip numbers from primary so "Cabo Pereyra 155 y 157 esq Gouchón" → primary street = "Cabo Pereyra"
    const primaryStreet = normalizeWhitespace(primary.replace(/\\d+/g, " ").replace(/\\by\\b/gi, " ").replace(/[-,]/g, " "));
    const crossing = normalizeWhitespace(cornerMatch[2]).replace(/^\\.?\\s*/, "");
    // Also strip numbers from crossing to get clean street name
    const crossingStreet = normalizeWhitespace(crossing.replace(/\\d+/g, " ").replace(/[-,]/g, " "));
    if (primaryStreet && crossingStreet) {
      queryCandidates.push(\`\${primaryStreet} y \${crossingStreet}, Colón\`);
    }
    if (primaryStreet && firstNumber) {
      queryCandidates.push(\`\${primaryStreet} \${firstNumber}, Colón\`);
    }
    if (crossingStreet && firstNumber) {
      queryCandidates.push(\`\${crossingStreet} \${firstNumber}, Colón\`);
    }
    if (primaryStreet) {
      queryCandidates.push(\`\${primaryStreet}, Colón\`);
    }
  } else {`;

if (!c.includes(OLD_CORNER)) { console.error("CORNER block not found"); process.exit(1); }
c = c.replace(OLD_CORNER, NEW_CORNER);
console.log("2. Improved cornerMatch query generation.");

// ─────────────────────────────────────────────────────────────────
// 3. Before "return uniqueQueries", add:
//    a) prefix-stripped fallback (Boulevard/Avenida/General → bare name)
//    b) last-word surname fallback ("Güemes 168" instead of "Boulevard Güemes 168")
//    c) first-number-only extraction from multi-number streets
// ─────────────────────────────────────────────────────────────────
const RETURN_MARKER = `  return uniqueQueries(queryCandidates);`;
const returnIdx = c.lastIndexOf(RETURN_MARKER);
if (returnIdx === -1) { console.error("return marker not found"); process.exit(1); }

const EXTRA_FALLBACKS = `  // ── Extra fallbacks for IGN partial-name matching ──────────────────────
  // a) Strip long street-type prefixes so "Boulevard Güemes 168" → "Güemes 168"
  const STRIP_PREFIXES = /^(?:Boulevard|Avenida|Pasaje|Diagonal|Acceso|Camino)\\s+/i;
  const baseStreet = cornerMatch
    ? normalizeWhitespace(cornerMatch[1].replace(/\\d+/g, " ").replace(/\\by\\b/gi, " ").replace(/[-,]/g, " "))
    : streetWithoutNumbers;
  const strippedBase = baseStreet.replace(STRIP_PREFIXES, "").trim();
  if (strippedBase && strippedBase !== baseStreet) {
    if (firstNumber) queryCandidates.push(\`\${strippedBase} \${firstNumber}, Colón\`);
    queryCandidates.push(\`\${strippedBase}, Colón\`);
  }
  // b) Surname-only: last significant word (≥4 chars) as ultra-short query for IGN partial match
  const lastWord = (strippedBase || baseStreet).split(/\\s+/).filter(w => w.length >= 4).pop() ?? "";
  if (lastWord && lastWord !== strippedBase && lastWord !== baseStreet) {
    if (firstNumber) queryCandidates.push(\`\${lastWord} \${firstNumber}, Colón\`);
  }
  // c) First number from multi-number patterns: already done via firstNumber, but
  //    ensure we also try the second distinct number for ranges like "987, 989"
  if (firstNumber && secondNumber && !cornerMatch) {
    queryCandidates.push(\`\${streetWithoutNumbers} \${secondNumber}, Colón\`);
  }

`;

const before = c.substring(0, returnIdx);
const after = c.substring(returnIdx);
c = before + EXTRA_FALLBACKS + after;
console.log("3. Added prefix-stripped + surname fallback queries.");

writeFileSync(f, c, "utf8");
console.log("Done. All patches applied.");
