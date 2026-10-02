/**
 * Utilidades de celdas. Reproducen el comportamiento del lector en Python (src/data_loader.py
 * y scripts/export_real_dataset.py) para que ambos produzcan el mismo resultado: la prueba de
 * paridad (scripts/check-parity.ts) lo verifica.
 */

export type Cell = string | number | boolean | null | undefined;
export type Grid = Cell[][];

/** Error de formato del Sheet: algo que el usuario puede corregir mirando su planilla. */
export class SheetsFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SheetsFormatError";
  }
}

const NUMERIC = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

/** Número o null. Vacío, texto no numérico y NaN son null: ausencia no es cero. */
export function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "string") {
    const t = value.trim();
    return NUMERIC.test(t) ? Number(t) : null;
  }
  return null;
}

/** Texto sin espacios sobrantes, o null si queda vacío. */
export function clean(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

/** Minúsculas y sin tildes, para comparar encabezados sin depender de cómo se escribieron. */
export function norm(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .toLowerCase()
    .trim();
}

export function slug(text: unknown): string {
  const s = String(text)
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return s || "sin-nombre";
}

/** Redondeo al par más cercano en los .5, como `round()` de Python. */
export function pyRound(x: number): number {
  const r = Math.round(x);
  return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
}

/** Millones con un decimal y separador de miles: 125.0, 1,234.5. */
export function mm1(x: number): string {
  return (x / 1e6).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function isoIfValid(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

/** Fecha ISO desde dd-mm-aaaa, dd/mm/aaaa, aaaa-mm-dd o un serial de planilla. null si no se puede. */
export function parseFecha(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    // Serial de planilla (días desde 1899-12-30). Rango razonable para evitar leer cualquier número.
    if (value > 20000 && value < 80000) return new Date(Date.UTC(1899, 11, 30) + value * 86400000).toISOString().slice(0, 10);
    return null;
  }
  const t = String(value).trim();
  let m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(t);
  if (m) return isoIfValid(Number(m[3]), Number(m[2]), Number(m[1]));
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return isoIfValid(Number(m[1]), Number(m[2]), Number(m[3]));
  return null;
}

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "ago-26" → "2026-08-01". También acepta fechas ISO (el Sheet puede convertir el texto en fecha). */
export function monthLabelToIso(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const t = norm(value);
  const m = /^([a-z]{3,4})[\s\-./]*(\d{2}|\d{4})$/.exec(t);
  if (m) {
    const idx = MONTHS.indexOf(m[1] === "sept" ? "sep" : m[1].slice(0, 3));
    if (idx >= 0) {
      const year = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
      return `${year}-${String(idx + 1).padStart(2, "0")}-01`;
    }
  }
  const iso = parseFecha(value);
  return iso ? `${iso.slice(0, 7)}-01` : null;
}

export function at(row: Cell[] | undefined, index: number): Cell {
  return row?.[index];
}

/** Índice de la primera fila (desde `from`) que cumple el predicado, o -1. */
export function findRow(grid: Grid, predicate: (row: Cell[], index: number) => boolean, from = 0): number {
  for (let i = from; i < grid.length; i++) if (predicate(grid[i] ?? [], i)) return i;
  return -1;
}

/**
 * Resuelve en qué columna está cada campo, buscando en la fila de encabezado por prefijo
 * (sin tildes ni mayúsculas). Así agregar o mover columnas en el Sheet no rompe la lectura.
 */
export function resolveColumns<K extends string>(
  header: Cell[],
  spec: Record<K, string[]>,
  optional: readonly string[] = [],
): Record<K, number> {
  const out = {} as Record<K, number>;
  const used = new Set<number>();
  for (const key of Object.keys(spec) as K[]) {
    const prefixes = spec[key].map(norm);
    let found = -1;
    for (let i = 0; i < header.length; i++) {
      if (used.has(i)) continue;
      const h = norm(header[i]);
      if (h && prefixes.some((p) => h === p || h.startsWith(p))) {
        found = i;
        break;
      }
    }
    if (found < 0 && !optional.includes(key)) {
      throw new SheetsFormatError(`No se encontró la columna "${spec[key][0]}" en el encabezado.`);
    }
    if (found >= 0) used.add(found);
    out[key] = found;
  }
  return out;
}
