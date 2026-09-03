/**
 * Formateo global de números en convención chilena: punto de miles, coma decimal.
 * Nunca mostrar $18,500,000,000 cuando puede mostrarse $18.500 MM.
 */

const MM = 1_000_000;

function esNumber(value: number, decimals: number): string {
  return new Intl.NumberFormat("es-CL", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/** CLP en millones: 18_500_000_000 → "$18.500 MM"; 950_000_000 → "$950 MM"; 4_500_000 → "$4,5 MM". */
export function formatCLP(value: number, opts: { decimals?: number; sign?: boolean } = {}): string {
  const millions = value / MM;
  const abs = Math.abs(millions);
  const decimals = opts.decimals ?? (abs >= 100 ? 0 : abs >= 10 ? 1 : 1);
  const body = `$${esNumber(abs, decimals)} MM`;
  if (value < 0) return `-${body}`;
  return opts.sign && value > 0 ? `+${body}` : body;
}

/** CLP completo con separador de miles, para tablas de detalle: "$1.234.567". */
export function formatCLPFull(value: number): string {
  const abs = esNumber(Math.abs(value), 0);
  return value < 0 ? `-$${abs}` : `$${abs}`;
}

export function formatUF(value: number, decimals = 0): string {
  return `UF ${esNumber(value, decimals)}`;
}

/** USD en millones/miles: 4_200_000 → "US$ 4,2M"; 850_000 → "US$ 850K". */
export function formatUSD(value: number): string {
  const abs = Math.abs(value);
  let body: string;
  if (abs >= MM) body = `US$ ${esNumber(abs / MM, 1)}M`;
  else if (abs >= 1_000) body = `US$ ${esNumber(abs / 1_000, 0)}K`;
  else body = `US$ ${esNumber(abs, 0)}`;
  return value < 0 ? `-${body}` : body;
}

/** 0.084 → "8,4%". */
export function formatPct(value: number, opts: { decimals?: number; sign?: boolean } = {}): string {
  const decimals = opts.decimals ?? 1;
  const body = `${esNumber(Math.abs(value) * 100, decimals)}%`;
  if (value < 0) return `-${body}`;
  return opts.sign && value > 0 ? `+${body}` : body;
}

/** 1.72 → "1,72x". */
export function formatMultiple(value: number, decimals = 2): string {
  return `${esNumber(value, decimals)}x`;
}

export function formatNumber(value: number, decimals = 0): string {
  return esNumber(value, decimals);
}

export function formatDate(iso: string): string {
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
  return new Intl.DateTimeFormat("es-CL", { day: "2-digit", month: "short", year: "numeric" }).format(d);
}

export function formatMonth(iso: string): string {
  const d = new Date(iso + (iso.length === 7 ? "-01T00:00:00" : iso.length === 10 ? "T00:00:00" : ""));
  return new Intl.DateTimeFormat("es-CL", { month: "short", year: "2-digit" }).format(d).replace(".", "");
}

export function formatYears(value: number): string {
  return `${esNumber(value, 1)} años`;
}

/** Eje de gráficos en CLP MM compacto: 18_500_000_000 → "18.500". */
export function formatAxisMM(value: number): string {
  return esNumber(value / MM, 0);
}

/** Marca de dato ausente en la fuente. Distinta de cero: "no informado" no es "vale cero". */
export const SIN_DATO = "s/d";

/**
 * Aplica un formateador solo si el dato existe; si no, devuelve "s/d".
 * `formatOr(m.capRate, formatPct)` → "6,2%" o "s/d".
 */
export function formatOr<T>(value: T | null | undefined, format: (v: T) => string, fallback = SIN_DATO): string {
  return value === null || value === undefined ? fallback : format(value);
}
