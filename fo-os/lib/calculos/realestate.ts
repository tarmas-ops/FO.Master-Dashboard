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

export interface RealEstateMetrics {
  asset: RealEstateAsset;
  familyShare: number;
  value: number;
  debt: number;
  equity: number;
  attributableEquity: number;
  noi: number;
  capRate: number;
  ltv: number;
  dscr: number | null;
  loans: Loan[];
  annualDebtService: number;
  unrealizedGain: number;
  rentPerM2: number;
  cashOnCash: number;
}

export function realEstateMetrics(db: Database, asset: RealEstateAsset): RealEstateMetrics {
  const eq = calculateAssetEquity(db, asset);
  const loans = loansForAsset(db, asset.id);
  const annualDebtService = loans.reduce((a, l) => a + l.annualDebtService, 0);
  const thesis = db.theses.find((t) => t.investmentId === asset.id);
  const initialEquity = thesis?.initialEquity ?? asset.acquisitionCost;
  return {
    asset,
    familyShare: familyOwnershipOfAsset(db, asset.id),
    value: asset.currentValue,
    debt: eq.grossDebt,
    equity: eq.equity,
    attributableEquity: eq.attributableEquity,
    noi: asset.noi,
    capRate: calculateCapRate(asset.noi, asset.currentValue),
    ltv: calculateLTV(asset.currentValue, eq.grossDebt),
    dscr: calculateDSCR(asset.noi, annualDebtService),
    loans,
    annualDebtService,
    unrealizedGain: asset.currentValue - asset.acquisitionCost,
    rentPerM2: asset.surfaceM2 > 0 ? asset.grossRent / 12 / asset.surfaceM2 : 0,
    cashOnCash: initialEquity > 0 ? (asset.noi - annualDebtService) / initialEquity : 0,
  };
}

export interface RealEstatePortfolio {
  rows: RealEstateMetrics[];
  totalValue: number;
  totalDebt: number;
  totalEquity: number;
  totalNOI: number;
  weightedCapRate: number;
  weightedLTV: number;
  weightedOccupancy: number;
  /** En base económica (look-through). */
  economicValue: number;
  economicDebt: number;
  economicEquity: number;
}

export function calculatePortfolioNOI(db: Database): number {
  return realEstateAssets(db).reduce((a, r) => a + r.noi, 0);
}

export function calculatePortfolioCapRate(db: Database): number {
  const rows = realEstateAssets(db).filter((r) => r.noi > 0);
  const value = rows.reduce((a, r) => a + r.currentValue, 0);
  return calculateCapRate(rows.reduce((a, r) => a + r.noi, 0), value);
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
  const totalNOI = rows.reduce((a, r) => a + r.noi, 0);
  const incomeRows = rows.filter((r) => r.noi > 0);
  const incomeValue = incomeRows.reduce((a, r) => a + r.value, 0);
  return {
    rows,
    totalValue,
    totalDebt,
    totalEquity: totalValue - totalDebt,
    totalNOI,
    weightedCapRate: calculateCapRate(totalNOI, incomeValue),
    weightedLTV: calculateLTV(totalValue, totalDebt),
    weightedOccupancy: incomeValue > 0 ? incomeRows.reduce((a, r) => a + r.asset.occupancy * r.value, 0) / incomeValue : 0,
    economicValue: rows.reduce((a, r) => a + r.value * r.familyShare, 0),
    economicDebt: rows.reduce((a, r) => a + r.debt * r.familyShare, 0),
    economicEquity: rows.reduce((a, r) => a + r.attributableEquity, 0),
  };
}
