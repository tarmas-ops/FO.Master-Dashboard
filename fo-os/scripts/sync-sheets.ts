/**
 * Sincroniza el dashboard con la planilla de Google Sheets. Corre automáticamente antes de
 * cada build (script `prebuild`), de modo que cada publicación en Vercel parte de la planilla
 * actual. Si la planilla no valida, sale con error: el build falla y Vercel deja en línea la
 * versión anterior.
 *
 *   npm run sync-sheets                 # descarga, valida y escribe data/real/dataset.json
 *   npm run sync-sheets -- --dry-run    # descarga y valida, sin escribir
 *
 * Variables de entorno:
 *   SHEETS_ENDPOINT          URL de la aplicación web del Apps Script
 *   SHEETS_TOKEN             token secreto del Apps Script
 *   SHEETS_ALLOW_BIG_CHANGE  =1 para aceptar un cambio desproporcionado una vez
 *   SHEETS_DATASET_PATH      (pruebas) destino alternativo del dataset
 *
 * Sin SHEETS_ENDPOINT ni SHEETS_TOKEN no hace nada y se usa el dataset incluido.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { calculateNetWorth } from "../lib/calculos/networth";
import { SheetsFormatError } from "../lib/sheets/cells";
import { fetchSheets, SheetsFetchError } from "../lib/sheets/fetch";
import { parseSource, type RentMappingEntry } from "../lib/sheets/source";
import { transform } from "../lib/sheets/transform";
import { validateForPublish } from "../lib/sheets/validate";
import type { Database } from "../types";

const root = join(__dirname, "..");
const datasetPath = process.env.SHEETS_DATASET_PATH ?? join(root, "data", "real", "dataset.json");
const mappingPath = join(root, "data", "real", "rent_mapping.json");
const dryRun = process.argv.includes("--dry-run");

const log = (msg: string) => console.log(`[sheets] ${msg}`);
function fail(title: string, lines: string[]): never {
  console.error(`\n[sheets] NO SE PUBLICA: ${title}`);
  for (const l of lines) console.error(`  - ${l}`);
  console.error("\n[sheets] Vercel mantiene en línea la versión anterior. Corrige la planilla y vuelve a publicar.\n");
  process.exit(1);
}

async function main() {
  const endpoint = process.env.SHEETS_ENDPOINT;
  const token = process.env.SHEETS_TOKEN;
  if (!endpoint && !token) {
    log("SHEETS_ENDPOINT y SHEETS_TOKEN no están definidos: se usa el dataset incluido en el repositorio.");
    return;
  }
  if (!endpoint || !token) {
    fail("configuración incompleta", [`Falta ${!endpoint ? "SHEETS_ENDPOINT" : "SHEETS_TOKEN"}. Deben definirse las dos o ninguna.`]);
  }

  log("Descargando la planilla…");
  const payload = await fetchSheets(endpoint, token);
  const tabs = Object.keys(payload.sheets);
  log(`Recibidas ${tabs.length} pestañas de "${payload.spreadsheetName ?? "planilla"}".`);

  const fallback = (JSON.parse(readFileSync(mappingPath, "utf8")) as { streams: Array<Omit<RentMappingEntry, "note"> & { note?: string }> }).streams.map(
    (s) => ({ ...s, note: s.note ?? null }),
  ) as RentMappingEntry[];

  const db = transform(parseSource(payload), {
    generatedAt: payload.generatedAt,
    sourceLabel: `Google Sheets — ${payload.spreadsheetName ?? "planilla"}`,
    rentMappingFallback: fallback,
  });

  let baseline: Database | null = null;
  if (existsSync(datasetPath)) {
    try {
      baseline = JSON.parse(readFileSync(datasetPath, "utf8")) as Database;
    } catch {
      baseline = null;
    }
  }
  const { errors, warnings } = validateForPublish(db, {
    payload,
    baseline,
    allowBigChange: process.env.SHEETS_ALLOW_BIG_CHANGE === "1",
  });
  for (const w of warnings) log(`aviso: ${w}`);
  if (errors.length > 0) fail("la planilla no pasó la validación", errors);

  const nw = calculateNetWorth(db);
  log(`Validación OK — ${db.assets.length} activos, ${db.transactions.length} movimientos, ${db.dataCoverage?.gaps.length ?? 0} brechas declaradas.`);
  log(`Corte del balance: ${db.dataCoverage?.balanceAsOf ?? "no declarado"} · patrimonio neto ${Math.round(nw.netWorth).toLocaleString("es-CL")} CLP.`);

  if (dryRun) {
    log("--dry-run: no se escribe el dataset.");
    return;
  }
  mkdirSync(dirname(datasetPath), { recursive: true });
  const tmp = `${datasetPath}.tmp`;
  writeFileSync(tmp, JSON.stringify(db, null, 1), "utf8");
  renameSync(tmp, datasetPath); // escritura atómica: nunca queda un dataset a medias
  log("Dataset actualizado.");
}

main().catch((e: unknown) => {
  if (e instanceof SheetsFormatError) fail("la planilla no tiene el formato esperado", [e.message]);
  if (e instanceof SheetsFetchError) fail("no se pudo leer la planilla", [e.message]);
  fail("error inesperado", [e instanceof Error ? e.message : String(e)]);
});
