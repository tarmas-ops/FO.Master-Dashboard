import type { Database, ValuationQuality } from "@/types";
import { allAssetEquities } from "./networth";

export const VALUATION_QUALITY_LABELS: Record<ValuationQuality, string> = {
  TASADO: "Tasado",
  CONTABLE: "Contable",
  SALDO: "Saldo reportado",
  PROXY: "Estimado (proxy)",
  SIN_DATO: "Sin dato",
};

export const VALUATION_QUALITY_HINTS: Record<ValuationQuality, string> = {
  TASADO: "Tasación comercial o valor de mercado directo.",
  CONTABLE: "Patrimonio contable informado; puede diferir del valor económico.",
  SALDO: "Saldo reportado por la institución financiera.",
  PROXY: "Estimado desde un indicador indirecto (avalúo fiscal × factor). El valor real puede diferir.",
  SIN_DATO: "No hay base de valorización: el valor cargado es cero.",
};

export const VALUATION_QUALITY_ORDER: ValuationQuality[] = ["TASADO", "SALDO", "CONTABLE", "PROXY", "SIN_DATO"];

export interface QualityRow {
  quality: ValuationQuality;
  count: number;
  /** Valor económico (look-through) de los activos con esa calidad. */
  value: number;
  /** Porción del total de activos. */
  share: number;
}

export interface ValuationQualityBreakdown {
  rows: QualityRow[];
  /** Activos que la fuente no clasificó. Si es todo, el desglose no aplica (p. ej. base demo). */
  unclassified: number;
  /** Porción del valor económico que descansa en estimaciones, no en tasación o saldo. */
  estimatedShare: number;
}

/**
 * ¿Cuánto del patrimonio descansa en un número sólido y cuánto en una estimación?
 * Un total de $15.000 MM se ve igual de preciso sea que provenga de tasaciones o de proxies;
 * este desglose es lo que permite al lector pesar la cifra.
 */
export function valuationQualityBreakdown(db: Database): ValuationQualityBreakdown {
  const equities = allAssetEquities(db);
  const total = equities.reduce((a, e) => a + e.economicValue, 0);
  const byQuality = new Map<ValuationQuality, { count: number; value: number }>();
  let unclassified = 0;
  for (const e of equities) {
    const q = e.asset.valuationQuality;
    if (!q) {
      unclassified += 1;
      continue;
    }
    const cur = byQuality.get(q) ?? { count: 0, value: 0 };
    cur.count += 1;
    cur.value += e.economicValue;
    byQuality.set(q, cur);
  }
  const rows = VALUATION_QUALITY_ORDER.filter((q) => byQuality.has(q)).map((quality) => {
    const { count, value } = byQuality.get(quality)!;
    return { quality, count, value, share: total > 0 ? value / total : 0 };
  });
  const estimated = rows.filter((r) => r.quality === "PROXY").reduce((a, r) => a + r.value, 0);
  return { rows, unclassified, estimatedShare: total > 0 ? estimated / total : 0 };
}
