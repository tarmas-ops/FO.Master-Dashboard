/** Tokens compartidos por todos los gráficos: pocos tonos, neutros, sin saturación. */
export const CHART_COLORS = ["#151515", "#52525b", "#8b8b95", "#b8b8c0", "#d8d8dd", "#ebebee", "#f3f3f5"];
export const AXIS = { stroke: "#a1a1aa", fontSize: 11 } as const;
export const GRID = { stroke: "#e7e7e3" } as const;
export const POSITIVE = "#15803d";
export const NEGATIVE = "#b91c1c";
export const INK = "#151515";
export const MUTED = "#71717a";

/**
 * Recharts tipa los formatters con uniones laxas (ValueType | undefined). Estos
 * adaptadores reciben `unknown` — asignable a cualquier parámetro por
 * contravarianza — y normalizan al tipo concreto que usan los gráficos.
 */
export function tooltipValue(fn: (value: number, name: string) => [string, string]) {
  return (value: unknown, name: unknown): [string, string] => fn(Number(value ?? 0), String(name ?? ""));
}

export function tooltipValueWithPayload<P>(fn: (value: number, payload: P) => [string, string]) {
  return (value: unknown, _name: unknown, item: unknown): [string, string] =>
    fn(Number(value ?? 0), (item as { payload: P } | undefined)?.payload as P);
}

export function tooltipLabel(fn: (label: string) => string) {
  return (label: unknown): string => fn(String(label ?? ""));
}

export function tooltipLabelWithPayload<P>(fn: (label: string, rows: Array<{ payload: P }>) => string) {
  return (label: unknown, payload: unknown): string => fn(String(label ?? ""), (payload as Array<{ payload: P }>) ?? []);
}

export const tooltipStyle = {
  contentStyle: {
    borderRadius: 8,
    border: "1px solid #e7e7e3",
    background: "#ffffff",
    boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
    fontSize: 12,
    padding: "8px 10px",
  },
  labelStyle: { color: "#71717a", fontSize: 11, marginBottom: 4, fontWeight: 500 },
  itemStyle: { color: "#151515", fontSize: 12, padding: 0 },
} as const;
