import type { Database } from "@/types";
import { allAssetEquities } from "./networth";
import { familyOwnershipOfEntity } from "./ownership";
import { realEstatePortfolio } from "./realestate";

function withinMonths(date: string, asOf: string, months: number): boolean {
  const d = new Date(date).getTime();
  const start = new Date(asOf).getTime();
  const end = new Date(asOf);
  end.setMonth(end.getMonth() + months);
  return d >= start && d <= end.getTime();
}

export interface Liquidity {
  cash: number;
  /** Renta fija disponible para venta. Las acciones públicas son asignación estratégica y no se cuentan. */
  liquidAssets: number;
  availableCreditLines: number;
  grossLiquidity: number;
  /** Caja + activos líquidos (sin líneas). */
  availableLiquidity: number;
}

export function calculateLiquidity(db: Database): Liquidity {
  const eq = allAssetEquities(db);
  const cash = eq.filter((e) => e.asset.assetClass === "CAJA").reduce((a, e) => a + e.economicValue, 0);
  const liquidAssets = eq.filter((e) => e.asset.assetClass === "RENTA_FIJA" && e.asset.liquid).reduce((a, e) => a + e.economicValue, 0);
  const availableCreditLines = db.creditLines.reduce((a, c) => a + (c.limit - c.drawn) * familyOwnershipOfEntity(db, c.entityId), 0);
  return {
    cash,
    liquidAssets,
    availableCreditLines,
    grossLiquidity: cash + liquidAssets + availableCreditLines,
    availableLiquidity: cash + liquidAssets,
  };
}

export interface InvestmentFirepower extends Liquidity {
  minimumReserve: number;
  upcomingCapitalCalls: number;
  committedCapex: number;
  deployableCapital: number;
  additionalDebtCapacity: number;
  totalCapacity: number;
  policyLTV: number;
}

/**
 * Capacidad de inversión: cuánto capital puede desplegarse sin comprometer la reserva
 * mínima, considerando caja, activos líquidos, líneas disponibles y capacidad
 * adicional de deuda (hasta el LTV de política sobre el portafolio inmobiliario).
 */
export function calculateInvestmentFirepower(db: Database, horizonMonths = 12): InvestmentFirepower {
  const liq = calculateLiquidity(db);
  const upcomingCapitalCalls = db.capitalCalls
    .filter((c) => c.status === "PENDIENTE" && withinMonths(c.dueDate, db.asOf, horizonMonths))
    .reduce((a, c) => a + c.amount * familyOwnershipOfEntity(db, c.entityId), 0);
  const committedCapex = db.commitments
    .filter((c) => c.type === "CAPEX" && withinMonths(c.dueDate, db.asOf, horizonMonths))
    .reduce((a, c) => a + c.amount * familyOwnershipOfEntity(db, c.entityId), 0);
  const minimumReserve = db.familyOffice.minimumLiquidityReserve;
  const deployableCapital = Math.max(liq.grossLiquidity - minimumReserve - upcomingCapitalCalls - committedCapex, 0);
  const re = realEstatePortfolio(db);
  const policyLTV = db.familyOffice.maxPolicyLTV;
  const additionalDebtCapacity = Math.max(policyLTV * re.economicValue - re.economicDebt, 0);
  return {
    ...liq,
    minimumReserve,
    upcomingCapitalCalls,
    committedCapex,
    deployableCapital,
    additionalDebtCapacity,
    totalCapacity: deployableCapital + additionalDebtCapacity,
    policyLTV,
  };
}

export interface LiquidityCoverage {
  horizonMonths: number;
  sources: number;
  uses: number;
  usesByType: { capitalCalls: number; debtMaturities: number; capex: number; taxes: number; newInvestments: number };
  coverage: number | null;
}

/** Cobertura de liquidez = (caja + activos líquidos + líneas) / usos comprometidos en el horizonte. */
export function calculateLiquidityCoverage(db: Database, horizonMonths: number): LiquidityCoverage {
  const liq = calculateLiquidity(db);
  const inWindow = db.commitments.filter((c) => withinMonths(c.dueDate, db.asOf, horizonMonths));
  const sum = (type: (typeof inWindow)[number]["type"]) =>
    inWindow.filter((c) => c.type === type).reduce((a, c) => a + c.amount * familyOwnershipOfEntity(db, c.entityId), 0);
  const usesByType = {
    capitalCalls: sum("CAPITAL_CALL"),
    debtMaturities: sum("DEUDA"),
    capex: sum("CAPEX"),
    taxes: sum("IMPUESTOS"),
    newInvestments: sum("NUEVA_INVERSION"),
  };
  const uses = Object.values(usesByType).reduce((a, v) => a + v, 0);
  return {
    horizonMonths,
    sources: liq.grossLiquidity,
    uses,
    usesByType,
    coverage: uses > 0 ? liq.grossLiquidity / uses : null,
  };
}
