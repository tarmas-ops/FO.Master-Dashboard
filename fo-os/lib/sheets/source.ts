/**
 * Lee las pestañas de la planilla y las convierte en estructuras tipadas.
 *
 * Diferencia clave con el lector original en Python (que apuntaba a filas fijas, p. ej.
 * "Bienes Raíces = filas 5 a 38"): aquí cada tabla se ubica por su fila de encabezado y se
 * lee hasta su marcador de cierre (TOTAL, SUBTOTAL, REFERENCIA). En una planilla viva eso
 * importa: una propiedad agregada en la fila 40 se perdería en silencio con rangos fijos.
 * Cuando algo queda fuera de lo que se lee, se avisa en `warnings` en vez de ignorarlo.
 */
import {
  type Cell,
  type Grid,
  SheetsFormatError,
  at,
  clean,
  findRow,
  monthLabelToIso,
  norm,
  num,
  parseFecha,
  resolveColumns,
} from "./cells";

export interface SheetsPayload {
  generatedAt: string;
  spreadsheetName?: string;
  sheets: Record<string, Grid>;
}

export interface CashRow {
  label: string;
  titular: Cell;
  perimetro: Cell;
  monto: number | null;
  nota: Cell;
}
export interface ConceptRow {
  concepto: string;
  monto: number | null;
}
export interface PropertyRow {
  id: number;
  tipo: string | null;
  direccion: string | null;
  comuna: Cell;
  rolSII: Cell;
  superficie: number | null;
  titular: Cell;
  avaluo: number | null;
  tasacion: number | null;
  pct: number;
  pctConfirmado: boolean;
  valorBalance: number | null;
  fuente: string;
}
export interface CompanyRow {
  empresa: string;
  rut: Cell;
  rutConfirmado: boolean;
  pct: number | null;
  patrimonio: number | null;
  equity: number;
}
export interface LiabilityRow {
  rut: Cell;
  empresa: Cell;
  comuna: Cell;
  deuda: number | null;
}
export interface RentMappingEntry {
  concept: string;
  match: string[];
  status: "CONFIRMADO" | "PROPUESTO" | "SIN_IDENTIFICAR";
  note: string | null;
}

export interface SourceData {
  supuestos: {
    fechaCorteBalance: string | null;
    fechaCorteFlujo: string | null;
    valorUF: number | null;
    tcUSD: number | null;
    factorTasacion: number;
  };
  personas: Array<{ persona: string; rol: string | null }>;
  liquidez: CashRow[];
  inversiones: CashRow[];
  cuentasPorCobrar: ConceptRow[];
  otrosMenores: ConceptRow[];
  bienesRaices: PropertyRow[];
  empresas: CompanyRow[];
  pasivos: LiabilityRow[];
  flujo: {
    meses: string[];
    ingresos: Map<string, Array<number | null>>;
    egresos: Map<string, Array<number | null>>;
  };
  balance: {
    totalActivos: number | null;
    totalPasivos: number | null;
    patrimonioNeto: number | null;
    distribucion: Array<{ clase: string; monto: number | null }>;
  };
  /** null si la planilla no trae la pestaña Mapeo_Arriendos (se usa el mapeo incluido). */
  mapeoArriendos: RentMappingEntry[] | null;
  /** Problemas que no impiden leer pero que el usuario debe conocer. */
  warnings: string[];
}

/** Pestañas que el lector necesita. Mapeo_Arriendos es opcional. */
export const REQUIRED_TABS = [
  "Supuestos",
  "Perimetro_Familiar",
  "Liquidez",
  "Inversiones_Financieras",
  "Otras_Partidas",
  "Bienes_Raices",
  "Empresas",
  "Pasivos",
  "Flujo_Caja",
  "Balance_Consolidado",
] as const;

function tab(payload: SheetsPayload, name: string): Grid {
  const grid = payload.sheets[name];
  if (!grid) throw new SheetsFormatError(`Falta la pestaña "${name}" en la planilla.`);
  return grid;
}

function mustFindRow(grid: Grid, sheet: string, what: string, predicate: (row: Cell[], i: number) => boolean, from = 0): number {
  const i = findRow(grid, predicate, from);
  if (i < 0) throw new SheetsFormatError(`En la pestaña "${sheet}" no se encontró ${what}.`);
  return i;
}

// ------------------------------------------------------------------ Supuestos

function parseSupuestos(grid: Grid) {
  const h = mustFindRow(grid, "Supuestos", 'la fila de encabezado ("Parámetro")', (r) => norm(at(r, 0)) === "parametro");
  const rows: Array<{ param: string; valor: Cell }> = [];
  for (let i = h + 1; i < grid.length; i++) {
    const param = clean(at(grid[i], 0));
    if (param) rows.push({ param, valor: at(grid[i], 1) });
  }
  const find = (substr: string): Cell => rows.find((r) => norm(r.param).includes(norm(substr)))?.valor;
  return {
    fechaCorteBalance: parseFecha(find("Fecha de corte — Balance")),
    fechaCorteFlujo: parseFecha(find("Fecha de corte — Flujo")),
    valorUF: num(find("Valor UF")),
    tcUSD: num(find("Tipo de cambio USD")),
    factorTasacion: num(find("Factor Tasación")) || 1.0,
  };
}

// ------------------------------------------------------------------ Perímetro

function parsePersonas(grid: Grid) {
  const h = mustFindRow(
    grid,
    "Perimetro_Familiar",
    'la tabla de personas (encabezado "Persona", "RUT", "Rol")',
    (r) => norm(at(r, 0)) === "persona" && norm(at(r, 2)) === "rol",
  );
  const out: Array<{ persona: string; rol: string | null }> = [];
  for (let i = h + 1; i < grid.length; i++) {
    const persona = clean(at(grid[i], 0));
    if (!persona) break; // la tabla termina en la primera fila vacía
    out.push({ persona, rol: clean(at(grid[i], 2)) });
  }
  return out;
}

// ------------------------------------------------- Liquidez / Inversiones

function parseCashTable(grid: Grid, sheet: string): CashRow[] {
  const h = mustFindRow(
    grid,
    sheet,
    'la tabla de cuentas (encabezado con "Monto")',
    (r) => (norm(at(r, 0)).startsWith("cuenta") || norm(at(r, 0)).startsWith("instrumento")) && r.some((c) => norm(c).startsWith("monto")),
  );
  const cols = resolveColumns(grid[h], { titular: ["titular"], perimetro: ["perimetro"], monto: ["monto"], nota: ["nota"] });
  const out: CashRow[] = [];
  for (let i = h + 1; i < grid.length; i++) {
    const label = clean(at(grid[i], 0));
    if (label && norm(label).startsWith("referencia")) break; // empieza el bloque de referencia
    if (!label) continue;
    if (norm(label).startsWith("subtotal")) continue;
    out.push({
      label,
      titular: at(grid[i], cols.titular),
      perimetro: at(grid[i], cols.perimetro),
      monto: num(at(grid[i], cols.monto)),
      nota: at(grid[i], cols.nota),
    });
  }
  return out;
}

// -------------------------------------------------------------- Otras partidas

function parseOtrasPartidas(grid: Grid) {
  const blocks: Record<"provisiones" | "cxc" | "menores", ConceptRow[]> = { provisiones: [], cxc: [], menores: [] };
  for (let h = 0; h < grid.length; h++) {
    if (norm(at(grid[h], 0)) !== "concepto" || !norm(at(grid[h], 1)).startsWith("monto")) continue;
    // El título del bloque es la fila no vacía inmediatamente anterior al encabezado.
    let title = "";
    for (let t = h - 1; t >= 0; t--) {
      const c = clean(at(grid[t], 0));
      if (c) {
        title = norm(c);
        break;
      }
    }
    const key = title.includes("cobrar") ? "cxc" : title.includes("menores") ? "menores" : title.includes("provision") ? "provisiones" : null;
    if (!key) continue;
    for (let i = h + 1; i < grid.length; i++) {
      const concepto = clean(at(grid[i], 0));
      if (concepto && norm(concepto).startsWith("subtotal")) break;
      if (concepto && norm(concepto) === "concepto") break;
      if (!concepto) continue;
      blocks[key].push({ concepto, monto: num(at(grid[i], 1)) });
    }
  }
  if (blocks.cxc.length === 0 && blocks.menores.length === 0) {
    throw new SheetsFormatError('En la pestaña "Otras_Partidas" no se encontraron las tablas de cuentas por cobrar y otros activos menores.');
  }
  return blocks;
}

// ---------------------------------------------------------------- Bienes raíces

function parseBienesRaices(grid: Grid, factor: number, warnings: string[]): PropertyRow[] {
  const h = mustFindRow(
    grid,
    "Bienes_Raices",
    'la tabla de propiedades (encabezado "Dirección" y "Avalúo Fiscal")',
    (r) => r.some((c) => norm(c).startsWith("direccion")) && r.some((c) => norm(c).startsWith("avaluo fiscal")),
  );
  const cols = resolveColumns(
    grid[h],
    {
      tipo: ["tipo"],
      direccion: ["direccion"],
      comuna: ["comuna"],
      rol: ["rol sii"],
      sup: ["sup"],
      titular: ["titular"],
      avaluo: ["avaluo fiscal"],
      tasacion: ["tasacion"],
      pct: ["% participacion", "participacion"],
    },
    ["comuna", "rol", "sup"],
  );
  const rows: PropertyRow[] = [];
  let totalRow = -1;
  for (let i = h + 1; i < grid.length; i++) {
    const row = grid[i];
    if (norm(at(row, cols.titular)) === "total") {
      totalRow = i;
      break;
    }
    const tipo = clean(at(row, cols.tipo));
    const direccion = clean(at(row, cols.direccion));
    if (tipo === null && direccion === null) continue;
    const avaluo = num(at(row, cols.avaluo));
    const tasacion = num(at(row, cols.tasacion));
    const pctRaw = num(at(row, cols.pct));
    const pct = pctRaw ?? 1.0;
    let valorBalance: number | null;
    let fuente: string;
    if (tasacion !== null) {
      valorBalance = tasacion;
      fuente = "Tasación directa/comercial";
    } else if (avaluo !== null) {
      valorBalance = avaluo * factor;
      fuente = "Avalúo Fiscal x factor (proxy)";
    } else {
      valorBalance = null;
      fuente = "Sin dato (pendiente)";
    }
    rows.push({
      id: rows.length + 1,
      tipo,
      direccion,
      comuna: cols.comuna >= 0 ? at(row, cols.comuna) : null,
      rolSII: cols.rol >= 0 ? at(row, cols.rol) : null,
      superficie: cols.sup >= 0 ? num(at(row, cols.sup)) : null,
      titular: at(row, cols.titular),
      avaluo,
      tasacion,
      pct,
      pctConfirmado: pctRaw !== null,
      valorBalance,
      fuente,
    });
  }
  warnUnreadBelowTotal(grid, totalRow, cols.direccion, [cols.avaluo, cols.tasacion], "Bienes_Raices", "propiedades", warnings);
  return rows;
}

/** Datos escritos debajo de la fila TOTAL no se leen: se avisa para que no se pierdan en silencio. */
function warnUnreadBelowTotal(
  grid: Grid,
  totalRow: number,
  labelCol: number,
  valueCols: number[],
  sheet: string,
  what: string,
  warnings: string[],
) {
  if (totalRow < 0) return;
  const stray: string[] = [];
  for (let i = totalRow + 1; i < grid.length; i++) {
    const label = clean(at(grid[i], labelCol));
    if (label && valueCols.some((c) => num(at(grid[i], c)) !== null)) stray.push(`fila ${i + 1}: ${label}`);
  }
  if (stray.length > 0) {
    warnings.push(
      `${sheet}: hay ${stray.length} fila(s) con datos debajo de la fila TOTAL que no se leyeron (${stray.slice(0, 3).join("; ")}). ` +
        `Las ${what} nuevas deben ir ARRIBA de la fila TOTAL.`,
    );
  }
}

// ---------------------------------------------------------------------- Empresas

function parseEmpresas(grid: Grid, warnings: string[]): CompanyRow[] {
  const h = mustFindRow(
    grid,
    "Empresas",
    'la tabla de empresas (encabezado "Empresa" y "Patrimonio Contable")',
    (r) => norm(at(r, 0)) === "empresa" && r.some((c) => norm(c).startsWith("patrimonio")),
  );
  const cols = resolveColumns(grid[h], { empresa: ["empresa"], rut: ["rut"], pct: ["% participacion", "participacion"], patrimonio: ["patrimonio"] });
  const out: CompanyRow[] = [];
  let totalRow = -1;
  for (let i = h + 1; i < grid.length; i++) {
    const empresa = clean(at(grid[i], cols.empresa));
    if (empresa && norm(empresa).startsWith("total")) {
      totalRow = i;
      break;
    }
    if (!empresa) continue;
    const rut = at(grid[i], cols.rut);
    const pct = num(at(grid[i], cols.pct));
    const patrimonio = num(at(grid[i], cols.patrimonio));
    const rutTexto = typeof rut === "string" ? rut : null;
    out.push({
      empresa,
      rut,
      rutConfirmado: rutTexto !== null && !norm(rutTexto).includes("pendiente") && !norm(rutTexto).includes("verificar"),
      pct,
      patrimonio,
      equity: pct !== null && patrimonio !== null ? pct * patrimonio : 0,
    });
  }
  warnUnreadBelowTotal(grid, totalRow, cols.empresa, [cols.pct, cols.patrimonio], "Empresas", "empresas", warnings);
  return out;
}

// ------------------------------------------------------------------------ Pasivos

function parsePasivos(grid: Grid): LiabilityRow[] {
  const h = mustFindRow(
    grid,
    "Pasivos",
    'la tabla de pasivos (encabezado "RUT" y "Empresa")',
    (r) => norm(at(r, 0)).startsWith("rut") && norm(at(r, 1)) === "empresa",
  );
  const out: LiabilityRow[] = [];
  for (let i = h + 1; i < grid.length; i++) {
    const b = clean(at(grid[i], 1));
    if (b && norm(b).startsWith("total")) break;
    if (!b) continue;
    out.push({ rut: at(grid[i], 0), empresa: b, comuna: at(grid[i], 2), deuda: num(at(grid[i], 3)) });
  }
  return out;
}

// ---------------------------------------------------------------- Flujo de caja

function parseFlujo(grid: Grid) {
  const h = mustFindRow(
    grid,
    "Flujo_Caja",
    'la fila de encabezado de meses ("Concepto", "ago-26", "sep-26"…)',
    (r) => norm(at(r, 0)) === "concepto" && monthLabelToIso(at(r, 1)) !== null,
  );
  const meses: string[] = [];
  for (let c = 1; c < grid[h].length; c++) {
    const iso = monthLabelToIso(at(grid[h], c));
    if (!iso) break;
    meses.push(iso);
  }

  const section = (startLabel: string, endPrefix: string): Map<string, Array<number | null>> => {
    const start = mustFindRow(grid, "Flujo_Caja", `la sección "${startLabel.toUpperCase()}"`, (r) => norm(at(r, 0)) === startLabel, h + 1);
    const out = new Map<string, Array<number | null>>();
    for (let i = start + 1; i < grid.length; i++) {
      const label = clean(at(grid[i], 0));
      if (label && norm(label).startsWith(endPrefix)) break;
      if (!label) continue;
      out.set(label, meses.map((_, k) => num(at(grid[i], 1 + k))));
    }
    return out;
  };

  return { meses, ingresos: section("ingresos", "total ingresos"), egresos: section("egresos", "total egresos") };
}

// ------------------------------------------------------------------------ Balance

function parseBalance(grid: Grid) {
  const total = (prefix: string, exclude?: string): number | null => {
    const i = findRow(grid, (r) => {
      const l = norm(at(r, 0));
      return l.startsWith(prefix) && (!exclude || !l.includes(exclude));
    });
    return i < 0 ? null : num(at(grid[i], 1));
  };
  const h = mustFindRow(
    grid,
    "Balance_Consolidado",
    'la tabla "Distribución de activos por clase"',
    (r) => norm(at(r, 0)) === "clase de activo" && norm(at(r, 1)).startsWith("monto") && norm(at(r, 2)).startsWith("% del total"),
  );
  const distribucion: Array<{ clase: string; monto: number | null }> = [];
  for (let i = h + 1; i < grid.length; i++) {
    const clase = clean(at(grid[i], 0));
    if (!clase) break;
    distribucion.push({ clase, monto: num(at(grid[i], 1)) });
  }
  return {
    totalActivos: total("total activos"),
    totalPasivos: total("total pasivos"),
    patrimonioNeto: total("patrimonio neto (", "ajustado"),
    distribucion,
  };
}

// --------------------------------------------------------------- Mapeo de arriendos

function normalizeStatus(raw: string | null): RentMappingEntry["status"] {
  const s = norm(raw);
  if (s.startsWith("confirm")) return "CONFIRMADO";
  if (s.startsWith("propuest") || s.includes("por confirmar")) return "PROPUESTO";
  return "SIN_IDENTIFICAR";
}

function parseMapeoArriendos(grid: Grid | undefined): RentMappingEntry[] | null {
  if (!grid) return null;
  const h = findRow(grid, (r) => norm(at(r, 0)) === "concepto" && norm(at(r, 1)).startsWith("propiedad"));
  if (h < 0) return null;
  const out: RentMappingEntry[] = [];
  for (let i = h + 1; i < grid.length; i++) {
    const concept = clean(at(grid[i], 0));
    if (!concept) continue;
    const match = String(at(grid[i], 1) ?? "")
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
    const status = match.length === 0 ? "SIN_IDENTIFICAR" : normalizeStatus(clean(at(grid[i], 2)));
    out.push({ concept, match, status, note: clean(at(grid[i], 3)) });
  }
  return out;
}

// ----------------------------------------------------------------------- Entrada

export function parseSource(payload: SheetsPayload): SourceData {
  const warnings: string[] = [];
  const supuestos = parseSupuestos(tab(payload, "Supuestos"));
  const otras = parseOtrasPartidas(tab(payload, "Otras_Partidas"));
  return {
    supuestos,
    personas: parsePersonas(tab(payload, "Perimetro_Familiar")),
    liquidez: parseCashTable(tab(payload, "Liquidez"), "Liquidez"),
    inversiones: parseCashTable(tab(payload, "Inversiones_Financieras"), "Inversiones_Financieras"),
    cuentasPorCobrar: otras.cxc,
    otrosMenores: otras.menores,
    bienesRaices: parseBienesRaices(tab(payload, "Bienes_Raices"), supuestos.factorTasacion, warnings),
    empresas: parseEmpresas(tab(payload, "Empresas"), warnings),
    pasivos: parsePasivos(tab(payload, "Pasivos")),
    flujo: parseFlujo(tab(payload, "Flujo_Caja")),
    balance: parseBalance(tab(payload, "Balance_Consolidado")),
    mapeoArriendos: parseMapeoArriendos(payload.sheets["Mapeo_Arriendos"]),
    warnings,
  };
}
