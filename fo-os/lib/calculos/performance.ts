import type { AssetClass, Database } from "@/types";
import { calculateCashFlow, trailingMonths } from "./cashflow";
import { allAssetEquities, calculateNetWorth } from "./networth";

export interface NetWorthPoint {
  year: number;
  netWorth: number;
  change: number | null;
  changePct: number | null;
  contributions: number;
  distributions: number;
  investmentGain: number;
}

/** Serie anual de patrimonio neto: cierres históricos + año en curso derivado en vivo. */
export function netWorthSeries(db: Database): NetWorthPoint[] {
  const history = [...db.netWorthHistory].sort((a, b) => a.year - b.year);
  const current = calculateNetWorth(db);
  const currentYear = Number(db.asOf.slice(0, 4));
  const last = history[history.length - 1];
  const ytd = calculateCashFlow(db, `${currentYear}-01`, db.asOf.slice(0, 7), true);
  const points = [
    ...history.map((h) => ({ year: h.year, netWorth: h.netWorth, contributions: h.contributions, distributions: h.distributions, investmentGain: h.investmentGain })),
    {
      year: currentYear,
      netWorth: current.netWorth,
      contributions: 0,
      distributions: ytd.byCategory.DISTRIBUCIONES + ytd.byCategory.DIVIDENDOS,
      investmentGain: current.netWorth - (last?.netWorth ?? current.netWorth),
    },
  ];
  return points.map((p, i) => {
    const prev = points[i - 1];
    return {
      ...p,
      change: prev ? p.netWorth - prev.netWorth : null,
      changePct: prev && prev.netWorth > 0 ? (p.netWorth - prev.netWorth) / prev.netWorth : null,
    };
  });
}

export type Period = "YTD" | "1A" | "3A" | "5A" | "INICIO";
export const PERIOD_LABELS: Record<Period, string> = { YTD: "YTD", "1A": "1 Año", "3A": "3 Años", "5A": "5 Años", INICIO: "Desde Inicio" };

/** Retorno simple del patrimonio neto en el período (sin aportes externos en el mock). */
export function netWorthReturn(db: Database, period: Period): { value: number; from: number; to: number; annualized: number } | null {
  const series = netWorthSeries(db);
  const current = series[series.length - 1];
  const yearsBack = period === "YTD" ? 1 : period === "1A" ? 1 : period === "3A" ? 3 : period === "5A" ? 5 : series.length - 1;
  const base = series[series.length - 1 - yearsBack];
  if (!base || base.netWorth <= 0) return null;
  const value = current.netWorth / base.netWorth - 1;
  const elapsed = period === "YTD" ? Math.max((new Date(db.asOf).getMonth() + 1) / 12, 1 / 12) : yearsBack;
  return { value, from: base.netWorth, to: current.netWorth, annualized: Math.pow(1 + value, 1 / elapsed) - 1 };
}

export interface ClassReturn {
  assetClass: AssetClass;
  /** `null` cuando ningún activo de la clase registra costo de adquisición. */
  invested: number | null;
  currentValue: number;
  unrealizedGain: number | null;
  simpleReturn: number | null;
  cashYieldLTM: number;
}

/** Retorno por clase: ganancia no realizada sobre costo (económico) + yield de caja LTM. */
export function returnsByClass(db: Database): ClassReturn[] {
  const eq = allAssetEquities(db);
  const { from, to } = trailingMonths(db.asOf, 12);
  const ltm = calculateCashFlow(db, from, to, true);
  const cashByClass: Partial<Record<AssetClass, number>> = {
    INMOBILIARIO: ltm.byCategory.ARRIENDOS - ltm.byCategory.GASTOS_OPERACIONALES,
    EMPRESAS_PRIVADAS: ltm.byCategory.DIVIDENDOS,
    MERCADOS_PRIVADOS: ltm.byCategory.DISTRIBUCIONES,
    RENTA_FIJA: ltm.byCategory.INTERESES,
  };
  const classes: AssetClass[] = ["INMOBILIARIO", "EMPRESAS_PRIVADAS", "MERCADOS_PRIVADOS", "MERCADOS_PUBLICOS", "RENTA_FIJA"];
  return classes.map((cls) => {
    const rows = eq.filter((e) => e.asset.assetClass === cls);
    // Solo se computa costo cuando la fuente lo registra; si nadie en la clase lo trae,
    // no hay base sobre la cual medir ganancia y la fila queda sin retorno, no en cero.
    const costRows = rows.filter((e) => e.asset.acquisitionCost !== undefined);
    const invested = costRows.length === 0 ? null : costRows.reduce((a, e) => a + (e.asset.acquisitionCost ?? 0) * e.familyShare, 0);
    const currentValue = rows.reduce((a, e) => a + e.economicValue, 0);
    const costValue = costRows.reduce((a, e) => a + e.economicValue, 0);
    return {
      assetClass: cls,
      invested,
      currentValue,
      unrealizedGain: invested === null ? null : costValue - invested,
      simpleReturn: invested !== null && invested > 0 ? costValue / invested - 1 : null,
      cashYieldLTM: currentValue > 0 ? (cashByClass[cls] ?? 0) / currentValue : 0,
    };
  });
}

export interface BridgeStep {
  label: string;
  value: number;
  kind: "total" | "delta";
}

/**
 * Bridge de patrimonio: inicial → ganancias → dividendos → aportes → retiros → impuestos → final.
 * Devuelve una lista vacía si la fuente no tiene un cierre anterior contra el cual comparar.
 */
export function netWorthBridge(db: Database): BridgeStep[] {
  const series = netWorthSeries(db);
  const start = series[series.length - 2];
  const end = series[series.length - 1];
  if (!start || !end) return [];
  const { from, to } = trailingMonths(db.asOf, 12);
  const ltm = calculateCashFlow(db, from, to, true);
  const dividends = ltm.byCategory.DIVIDENDOS + ltm.byCategory.DISTRIBUCIONES + ltm.byCategory.INTERESES;
  const taxes = -ltm.byCategory.IMPUESTOS;
  const withdrawals = -ltm.byCategory.GASTOS_FAMILY_OFFICE;
  const contributions = 0;
  const gain = end.netWorth - start.netWorth - dividends - taxes - withdrawals - contributions;
  return [
    { label: "Patrimonio Inicial", value: start.netWorth, kind: "total" },
    { label: "Ganancia de Inversiones", value: gain, kind: "delta" },
    { label: "Dividendos e Intereses", value: dividends, kind: "delta" },
    { label: "Aportes", value: contributions, kind: "delta" },
    { label: "Retiros y Gastos", value: withdrawals, kind: "delta" },
    { label: "Impuestos", value: taxes, kind: "delta" },
    { label: "Patrimonio Final", value: end.netWorth, kind: "total" },
  ];
}
