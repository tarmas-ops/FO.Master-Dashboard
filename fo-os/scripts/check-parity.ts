/**
 * Prueba de paridad: el lector de Google Sheets (TypeScript) debe producir el mismo
 * `Database` que el lector original (Python) a partir del mismo Excel.
 *
 *   python3 scripts/export_sheet_fixture.py   # simula la respuesta de Google Sheets
 *   python3 scripts/export_real_dataset.py    # referencia: dataset.json
 *   npm run check-parity
 *
 * El archivo simulado contiene el patrimonio real, así que no se versiona.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseSource, type SheetsPayload } from "../lib/sheets/source";
import { transform } from "../lib/sheets/transform";

const root = join(__dirname, "..");
const fixturePath = join(root, ".sheets-fixture", "payload.json");
const referencePath = join(root, "data", "real", "dataset.json");
const mappingPath = join(root, "data", "real", "rent_mapping.json");

if (!existsSync(fixturePath)) {
  console.error("Falta .sheets-fixture/payload.json. Genéralo con: python3 scripts/export_sheet_fixture.py");
  process.exit(2);
}

const payload = JSON.parse(readFileSync(fixturePath, "utf8")) as SheetsPayload;
const reference = JSON.parse(readFileSync(referencePath, "utf8")) as Record<string, unknown>;
const fallback = (JSON.parse(readFileSync(mappingPath, "utf8")) as { streams: Array<{ concept: string; match: string[]; status: never; note?: string }> }).streams.map(
  (s) => ({ ...s, note: s.note ?? null }),
);

const actual = transform(parseSource(payload), {
  generatedAt: payload.generatedAt,
  sourceLabel: "paridad",
  rentMappingFallback: fallback,
}) as unknown as Record<string, unknown>;

// Campos que por diseño difieren entre ambos caminos: la fuente y la hora de procesamiento.
const IGNORED = new Set(["dataCoverage.loadedAt", "dataCoverage.source"]);

const diffs: string[] = [];
function compare(a: unknown, b: unknown, path: string): void {
  if (IGNORED.has(path)) return;
  if (typeof a === "number" && typeof b === "number") {
    if (Math.abs(a - b) > 1e-9 * Math.max(1, Math.abs(a), Math.abs(b))) diffs.push(`${path}: TS=${a}  PY=${b}`);
    return;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) diffs.push(`${path}: largo TS=${a.length}  PY=${b.length}`);
    for (let i = 0; i < Math.min(a.length, b.length); i++) compare(a[i], b[i], `${path}[${i}]`);
    return;
  }
  if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
    const ao = a as Record<string, unknown>;
    const bo = b as Record<string, unknown>;
    for (const k of new Set([...Object.keys(ao), ...Object.keys(bo)])) {
      const inA = k in ao && ao[k] !== undefined;
      const inB = k in bo;
      if (inA !== inB) diffs.push(`${path ? path + "." : ""}${k}: ${inA ? "solo en TS" : "solo en PY"}`);
      else if (inA) compare(ao[k], bo[k], path ? `${path}.${k}` : k);
    }
    return;
  }
  if (a !== b) diffs.push(`${path}: TS=${JSON.stringify(a)}  PY=${JSON.stringify(b)}`);
}

compare(actual, reference, "");

const counts = ["entities", "assets", "loans", "transactions", "rentStreams"].map((k) => `${k}=${(actual[k] as unknown[]).length}`).join("  ");
console.log(`TypeScript: ${counts}`);
if (diffs.length === 0) {
  console.log("PARIDAD: OK — el lector de Google Sheets reproduce exactamente el dataset de referencia.");
} else {
  console.log(`PARIDAD: ${diffs.length} diferencia(s)`);
  for (const d of diffs.slice(0, 40)) console.log("  -", d);
  process.exit(1);
}
