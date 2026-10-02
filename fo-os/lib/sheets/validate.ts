/**
 * Validación previa a publicar. Si algo de esto falla, la sincronización aborta el build y
 * Vercel mantiene en línea la versión anterior: una planilla mal editada nunca llega al
 * dashboard. Lo que no impide leer pero conviene saber va a `warnings`.
 */
import { calculateNetWorth } from "../calculos/networth";
import { validatePortfolioConsistency } from "../calculos/validate";
import type { Database } from "@/types";
import type { Grid } from "./cells";
import { REQUIRED_TABS, type SheetsPayload } from "./source";

export interface ValidationResult {
  errors: string[];
  warnings: string[];
}

const ERROR_VALUE = /^#(N\/A|REF!|DIV\/0!|VALUE!|NAME\?|NUM!|NULL!|ERROR!)/;

/** Notación A1 de una columna (0 → A, 26 → AA). */
function columnName(index: number): string {
  let n = index;
  let name = "";
  do {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return name;
}

/** Celdas con error de fórmula (#REF!, #DIV/0!…) en las pestañas que se leen. */
export function findFormulaErrors(sheets: Record<string, Grid>): string[] {
  const found: string[] = [];
  for (const name of REQUIRED_TABS) {
    (sheets[name] ?? []).forEach((row, r) =>
      row.forEach((cell, c) => {
        if (typeof cell === "string" && ERROR_VALUE.test(cell.trim())) found.push(`${name}!${columnName(c)}${r + 1} (${cell.trim()})`);
      }),
    );
  }
  return found;
}

function finiteCheck(db: Database): string[] {
  const bad: string[] = [];
  for (const a of db.assets) if (!Number.isFinite(a.currentValue) || !Number.isFinite(a.ownershipPercentage)) bad.push(a.name);
  return bad;
}

export interface ValidateOptions {
  payload: SheetsPayload;
  /** Base anterior (la última publicada), para detectar cambios desproporcionados. */
  baseline?: Database | null;
  /** Variación máxima tolerada del patrimonio o de la cantidad de activos sin confirmación. */
  maxChange?: number;
  allowBigChange?: boolean;
}

export function validateForPublish(db: Database, options: ValidateOptions): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const { payload, baseline, maxChange = 0.4, allowBigChange = false } = options;

  const formulaErrors = findFormulaErrors(payload.sheets);
  if (formulaErrors.length > 0) {
    errors.push(
      `Hay ${formulaErrors.length} celda(s) con error de fórmula en la planilla: ${formulaErrors.slice(0, 8).join(", ")}${formulaErrors.length > 8 ? "…" : ""}. Corrígelas antes de publicar.`,
    );
  }

  if (db.assets.length === 0) errors.push("No se cargó ningún activo.");
  const bad = finiteCheck(db);
  if (bad.length > 0) errors.push(`Valores no numéricos en: ${bad.slice(0, 5).join(", ")}.`);

  for (const issue of validatePortfolioConsistency(db)) {
    if (issue.level === "error") errors.push(`Conciliación: ${issue.check} — ${issue.detail}`);
    else warnings.push(`Conciliación: ${issue.check} — ${issue.detail}`);
  }

  // Cambios desproporcionados respecto de la última versión publicada: casi siempre son una
  // pestaña borrada o un rango movido, no un cambio real del patrimonio.
  if (baseline && baseline.assets.length > 0) {
    const before = calculateNetWorth(baseline).netWorth;
    const after = calculateNetWorth(db).netWorth;
    const assetsChange = Math.abs(db.assets.length - baseline.assets.length) / baseline.assets.length;
    const nwChange = before > 0 ? Math.abs(after - before) / before : 0;
    if ((assetsChange > maxChange || nwChange > maxChange) && !allowBigChange) {
      errors.push(
        `Cambio desproporcionado respecto de la última versión publicada: patrimonio neto ${Math.round(nwChange * 100)}% y cantidad de activos ${Math.round(assetsChange * 100)}% (tope ${Math.round(maxChange * 100)}%). ` +
          "Si es un cambio real, define SHEETS_ALLOW_BIG_CHANGE=1 en Vercel para esta publicación.",
      );
    }
  }

  for (const line of db.dataCoverage?.reconciliation ?? []) {
    if (Math.abs(line.difference) > 1) warnings.push(`El balance de la planilla difiere del detalle en "${line.concept}": ${Math.round(line.difference).toLocaleString("es-CL")} CLP.`);
  }
  return { errors, warnings };
}
