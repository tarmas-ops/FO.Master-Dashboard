import type { AssetClass, Database } from "@/types";
import { ASSET_CLASS_LABELS, ASSET_CLASS_ORDER, calculateEconomicExposure } from "./exposure";
import { calculateNetWorth } from "./networth";

export type AllocationStatus = "SOBREPONDERADO" | "NEUTRAL" | "SUBPONDERADO";

export interface AllocationRow {
  assetClass: AssetClass;
  label: string;
  current: number;
  target: number;
  currentValue: number;
  targetValue: number;
  /** CLP a mover para llegar al objetivo (positivo = comprar, negativo = vender). */
  rebalanceAmount: number;
  status: AllocationStatus;
}

const NEUTRAL_BAND = 0.02;

/** Asignación actual vs objetivo por clase de activo, con monto requerido para rebalancear. */
export function calculatePortfolioAllocation(db: Database): AllocationRow[] {
  const exposure = calculateEconomicExposure(db);
  const { totalAssets } = calculateNetWorth(db);
  const targets = new Map(db.allocationTargets.map((t) => [t.assetClass, t.target]));
  return ASSET_CLASS_ORDER.map((cls) => {
    const row = exposure.find((e) => e.key === cls);
    const current = row?.share ?? 0;
    const currentValue = row?.value ?? 0;
    const target = targets.get(cls) ?? 0;
    const targetValue = target * totalAssets;
    const diff = current - target;
    return {
      assetClass: cls,
      label: ASSET_CLASS_LABELS[cls],
      current,
      target,
      currentValue,
      targetValue,
      rebalanceAmount: targetValue - currentValue,
      status: diff > NEUTRAL_BAND ? "SOBREPONDERADO" : diff < -NEUTRAL_BAND ? "SUBPONDERADO" : "NEUTRAL",
    };
  });
}
