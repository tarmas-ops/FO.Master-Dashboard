import type { Database, Loan, RealEstateAsset } from "@/types";
import { calculateAssetEquity, loansForAsset } from "./networth";
import { familyOwnershipOfAsset } from "./ownership";

export function realEstateAssets(db: Database): RealEstateAsset[] {
  return db.assets.filter((a): a is RealEstateAsset => a.assetClass === "INMOBILIARIO");
}

export function calculateLTV(value: number, debt: number): number {
  return value > 0 ? debt / value : 0;
}

export function calculateCapRate(noi: number, value: number): number {
  return value > 0 ? noi / value : 0;
}

/** DSCR = NOI / servicio de deuda anual. */
export function calculateDSCR(noi: number, annualDebtService: number): number | null {
  return annualDebtService > 0 ? noi / annualDebtService : null;
}

/**
 * Las métricas de renta (NOI, cap rate, DSCR, renta/m², cash-on-cash) son `null` cuando la
 * fuente no registra el dato. Un inmueble sin NOI informado no es un inmueble con NOI cero:
 * mostrarlo como 0% de cap rate sería inventar una cifra.
 */
export interface RealEstateMetrics {
  asset: RealEstateAsset;
  familyShare: number;
  value: number;
  debt: number;
  equity: number;
  attributableEquity: number;
  noi: number | null;
  capRate: number | null;
  ltv: number;
  dscr: number | null;
  loans: Loan[];
  annualDebtService: number;
  unrealizedGain: number | null;
  rentPerM2: number | null;
  cashOnCash: number | null;
}

export function realEstateMetrics(db: Database, asset: RealEstateAsset): RealEstateMetrics {
  const eq = calculateAssetEquity(db, asset);
  const loans = loansForAsset(db, asset.id);
  const annualDebtService = loans.reduce((a, l) => a + l.annualDebtService, 0);
  const thesis = db.theses.find((t) => t.investmentId === asset.id);
  const initialEquity = thesis?.initialEquity ?? asset.acquisitionCost;
  const noi = asset.noi ?? null;
  return {
    asset,
    familyShare: familyOwnershipOfAsset(db, asset.id),
    value: asset.currentValue,
    debt: eq.grossDebt,
    equity: eq.equity,
    attributableEquity: eq.attributableEquity,
    noi,
    capRate: noi === null ? null : calculateCapRate(noi, asset.currentValue),
    ltv: calculateLTV(asset.currentValue, eq.grossDebt),
    dscr: noi === null ? null : calculateDSCR(noi, annualDebtService),
    loans,
    annualDebtService,
    unrealizedGain: asset.acquisitionCost === undefined ? null : asset.currentValue - asset.acquisitionCost,
    rentPerM2:
      asset.surfaceM2 !== undefined && asset.surfaceM2 > 0 && asset.grossRent !== undefined
        ? asset.grossRent / 12 / asset.surfaceM2
        : null,
    cashOnCash: noi !== null && initialEquity !== undefined && initialEquity > 0 ? (noi - annualDebtService) / initialEquity : null,
  };
}

export interface RealEstatePortfolio {
  rows: RealEstateMetrics[];
  totalValue: number;
  totalDebt: number;
  totalEquity: number;
  /** Suma del NOI informado. `null` si ningún inmueble lo declara. */
  totalNOI: number | null;
  weightedCapRate: number | null;
  weightedLTV: number;
  weightedOccupancy: number | null;
  /** Cuántos inmuebles declaran NOI y ocupación, sobre el total de la cartera. */
  coverage: { withNOI: number; withOccupancy: number; total: number };
  /** En base económica (look-through). */
  economicValue: number;
  economicDebt: number;
  economicEquity: number;
}

export function calculatePortfolioNOI(db: Database): number | null {
  const withNOI = realEstateAssets(db).filter((r) => r.noi !== undefined);
  return withNOI.length === 0 ? null : withNOI.reduce((a, r) => a + (r.noi ?? 0), 0);
}

export function calculatePortfolioCapRate(db: Database): number | null {
  const rows = realEstateAssets(db).filter((r) => (r.noi ?? 0) > 0);
  if (rows.length === 0) return null;
  const value = rows.reduce((a, r) => a + r.currentValue, 0);
  return calculateCapRate(rows.reduce((a, r) => a + (r.noi ?? 0), 0), value);
}

export function calculateWeightedLTV(db: Database): number {
  const rows = realEstateAssets(db).map((r) => realEstateMetrics(db, r));
  const value = rows.reduce((a, r) => a + r.value, 0);
  const debt = rows.reduce((a, r) => a + r.debt, 0);
  return calculateLTV(value, debt);
}

export function realEstatePortfolio(db: Database): RealEstatePortfolio {
  const rows = realEstateAssets(db).map((r) => realEstateMetrics(db, r));
  const totalValue = rows.reduce((a, r) => a + r.value, 0);
  const totalDebt = rows.reduce((a, r) => a + r.debt, 0);
  const noiRows = rows.filter((r) => r.noi !== null);
  const incomeRows = rows.filter((r) => (r.noi ?? 0) > 0);
  const incomeValue = incomeRows.reduce((a, r) => a + r.value, 0);
  const occupancyRows = rows.filter((r) => r.asset.occupancy !== undefined);
  const occupancyValue = occupancyRows.reduce((a, r) => a + r.value, 0);
  const totalNOI = noiRows.length === 0 ? null : noiRows.reduce((a, r) => a + (r.noi ?? 0), 0);
  return {
    rows,
    totalValue,
    totalDebt,
    totalEquity: totalValue - totalDebt,
    totalNOI,
    weightedCapRate: incomeValue === 0 ? null : calculateCapRate(incomeRows.reduce((a, r) => a + (r.noi ?? 0), 0), incomeValue),
    weightedLTV: calculateLTV(totalValue, totalDebt),
    weightedOccupancy:
      occupancyValue > 0 ? occupancyRows.reduce((a, r) => a + (r.asset.occupancy ?? 0) * r.value, 0) / occupancyValue : null,
    coverage: { withNOI: noiRows.length, withOccupancy: occupancyRows.length, total: rows.length },
    economicValue: rows.reduce((a, r) => a + r.value * r.familyShare, 0),
    economicDebt: rows.reduce((a, r) => a + r.debt * r.familyShare, 0),
    economicEquity: rows.reduce((a, r) => a + r.attributableEquity, 0),
  };
}
