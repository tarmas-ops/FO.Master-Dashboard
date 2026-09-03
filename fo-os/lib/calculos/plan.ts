import type { Asset, Database, InvestmentThesis } from "@/types";
import { calculateAssetEquity } from "./networth";
import { realEstateMetrics } from "./realestate";
import { directAssetIRR, fundMetrics, unleveredAssetIRR } from "./returns";

export type PlanStatus = "SOBRE_PLAN" | "EN_LINEA" | "BAJO_PLAN" | "REVISION_REQUERIDA";

export const PLAN_STATUS_LABELS: Record<PlanStatus, string> = {
  SOBRE_PLAN: "Sobre Plan",
  EN_LINEA: "En Línea",
  BAJO_PLAN: "Bajo Plan",
  REVISION_REQUERIDA: "Revisión Requerida",
};

export interface PlanComparison {
  metric: string;
  actual: number | null;
  expected: number | null;
  variance: number | null;
  format: "clp" | "pct" | "multiple";
  status: PlanStatus;
}

export interface PerformanceVsPlan {
  asset: Asset;
  thesis: InvestmentThesis;
  actualIRR: number | null;
  baseCaseIRR: number;
  varianceIRR: number | null;
  actualNOI: number | null;
  expectedNOI: number | null;
  actualValue: number;
  expectedValue: number | null;
  actualMOIC: number | null;
  targetMOIC: number;
  status: PlanStatus;
  comparisons: PlanComparison[];
}

function statusFromVariance(variance: number | null, tolerance: number, higherIsBetter = true): PlanStatus {
  if (variance === null) return "REVISION_REQUERIDA";
  const v = higherIsBetter ? variance : -variance;
  if (v > tolerance) return "SOBRE_PLAN";
  if (v < -tolerance) return "BAJO_PLAN";
  return "EN_LINEA";
}

/**
 * Compara la realidad contra la tesis original: ¿nuestra tesis se está cumpliendo?
 * Usa datos reales de valorización, NOI y deuda; nunca cifras escritas a mano.
 */
export function calculateInvestmentPerformanceVsPlan(db: Database, asset: Asset): PerformanceVsPlan | null {
  const thesis = db.theses.find((t) => t.investmentId === asset.id);
  if (!thesis) return null;
  const eq = calculateAssetEquity(db, asset);
  const comparisons: PlanComparison[] = [];

  let actualIRR: number | null = null;
  let actualNOI: number | null = null;
  let actualMOIC: number | null = null;

  if (asset.assetClass === "INMOBILIARIO") {
    const m = realEstateMetrics(db, asset);
    actualNOI = asset.noi;
    actualIRR = directAssetIRR(thesis.investmentDate, thesis.initialEquity, asset.noi - m.annualDebtService, eq.equity, db.asOf);
    actualMOIC = thesis.initialEquity > 0 ? eq.equity / thesis.initialEquity : null;
    if (thesis.expectedNOI !== undefined) {
      const v = (asset.noi - thesis.expectedNOI) / thesis.expectedNOI;
      comparisons.push({ metric: "NOI", actual: asset.noi, expected: thesis.expectedNOI, variance: v, format: "clp", status: statusFromVariance(v, 0.05) });
    }
    if (thesis.expectedOccupancy !== undefined) {
      const v = asset.occupancy - thesis.expectedOccupancy;
      comparisons.push({ metric: "Ocupación", actual: asset.occupancy, expected: thesis.expectedOccupancy, variance: v, format: "pct", status: statusFromVariance(v, 0.03) });
    }
    if (thesis.expectedLTV !== undefined) {
      const v = m.ltv - thesis.expectedLTV;
      comparisons.push({ metric: "LTV", actual: m.ltv, expected: thesis.expectedLTV, variance: v, format: "pct", status: statusFromVariance(v, 0.05, false) });
    }
    const cocV = m.cashOnCash - thesis.targetCashOnCash;
    comparisons.push({ metric: "Cash-on-Cash", actual: m.cashOnCash, expected: thesis.targetCashOnCash, variance: cocV, format: "pct", status: statusFromVariance(cocV, 0.015) });
    if (thesis.targetExitCapRate !== undefined) {
      const v = m.capRate - thesis.targetExitCapRate;
      comparisons.push({ metric: "Cap Rate", actual: m.capRate, expected: thesis.targetExitCapRate, variance: v, format: "pct", status: statusFromVariance(v, 0.005, false) });
    }
    const unlevered = unleveredAssetIRR(thesis.investmentDate, asset.acquisitionCost, asset.noi, asset.currentValue, db.asOf);
    if (unlevered !== null) {
      comparisons.push({ metric: "IRR Sin Apalancamiento", actual: unlevered, expected: thesis.entryCapRate ?? null, variance: null, format: "pct", status: "EN_LINEA" });
    }
  } else if (asset.assetClass === "MERCADOS_PRIVADOS") {
    const fm = fundMetrics(db, asset);
    actualIRR = fm.irr;
    actualMOIC = fm.moic;
    const mv = fm.moic - thesis.targetMOIC * Math.min(1, (new Date(db.asOf).getFullYear() - asset.vintage) / thesis.expectedHoldPeriod + 0.35);
    comparisons.push({ metric: "MOIC vs. curva esperada", actual: fm.moic, expected: thesis.targetMOIC, variance: mv, format: "multiple", status: statusFromVariance(mv, 0.15) });
  } else {
    actualIRR = directAssetIRR(thesis.investmentDate, thesis.initialEquity, asset.assetClass === "EMPRESAS_PRIVADAS" ? asset.dividendsLTM * asset.ownershipPercentage : 0, eq.attributableEquity / Math.max(eq.familyShare, 1e-9) * asset.ownershipPercentage, db.asOf);
    actualMOIC = thesis.initialEquity > 0 ? (eq.equity * asset.ownershipPercentage) / thesis.initialEquity : null;
  }

  if (thesis.expectedValueToday !== undefined) {
    const v = (asset.currentValue - thesis.expectedValueToday) / thesis.expectedValueToday;
    comparisons.unshift({ metric: "Valor", actual: asset.currentValue, expected: thesis.expectedValueToday, variance: v, format: "clp", status: statusFromVariance(v, 0.05) });
  }
  const varianceIRR = actualIRR === null ? null : actualIRR - thesis.baseCaseIRR;
  comparisons.unshift({ metric: "IRR", actual: actualIRR, expected: thesis.baseCaseIRR, variance: varianceIRR, format: "pct", status: statusFromVariance(varianceIRR, 0.02) });

  const scored = comparisons.filter((c) => c.status !== "REVISION_REQUERIDA");
  const below = scored.filter((c) => c.status === "BAJO_PLAN").length;
  const above = scored.filter((c) => c.status === "SOBRE_PLAN").length;
  const irrStatus = comparisons[0]?.status ?? "REVISION_REQUERIDA";
  // La IRR manda: si está bajo el caso base y hay más métricas flojas, la inversión
  // está bajo plan; si solo falla la IRR, se marca para revisión.
  let status: PlanStatus;
  if (scored.length === 0) status = "REVISION_REQUERIDA";
  else if (irrStatus === "BAJO_PLAN") status = below >= 2 ? "BAJO_PLAN" : "REVISION_REQUERIDA";
  else if (below > scored.length / 2) status = "REVISION_REQUERIDA";
  else if (above > below && above > scored.length / 2) status = "SOBRE_PLAN";
  else status = "EN_LINEA";

  return {
    asset,
    thesis,
    actualIRR,
    baseCaseIRR: thesis.baseCaseIRR,
    varianceIRR,
    actualNOI,
    expectedNOI: thesis.expectedNOI ?? null,
    actualValue: asset.currentValue,
    expectedValue: thesis.expectedValueToday ?? null,
    actualMOIC,
    targetMOIC: thesis.targetMOIC,
    status,
    comparisons,
  };
}

export function allPerformanceVsPlan(db: Database): PerformanceVsPlan[] {
  return db.assets.map((a) => calculateInvestmentPerformanceVsPlan(db, a)).filter((p): p is PerformanceVsPlan => p !== null);
}
