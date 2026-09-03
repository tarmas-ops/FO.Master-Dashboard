import type { Asset, Database, Loan } from "@/types";
import { familyOwnershipOfAsset, familyOwnershipOfEntity } from "./ownership";

export interface AssetEquity {
  asset: Asset;
  /** Participación económica del FO en el activo (0–1). */
  familyShare: number;
  /** Valor 100% del activo. */
  grossValue: number;
  /** Deuda 100% asociada al activo. */
  grossDebt: number;
  /** Valor del activo − deuda asociada (100%). */
  equity: number;
  /** Valor económico atribuible al FO. */
  economicValue: number;
  /** Deuda económica atribuible al FO. */
  economicDebt: number;
  /** Equity atribuible al FO. */
  attributableEquity: number;
}

export function loansForAsset(db: Database, assetId: string): Loan[] {
  return db.loans.filter((l) => l.assetId === assetId);
}

/** Valor del activo − deuda asociada = equity del activo; × participación económica = equity atribuible. */
export function calculateAssetEquity(db: Database, asset: Asset): AssetEquity {
  const familyShare = familyOwnershipOfAsset(db, asset.id);
  const grossDebt = loansForAsset(db, asset.id).reduce((a, l) => a + l.balance, 0);
  const equity = asset.currentValue - grossDebt;
  return {
    asset,
    familyShare,
    grossValue: asset.currentValue,
    grossDebt,
    equity,
    economicValue: asset.currentValue * familyShare,
    economicDebt: grossDebt * familyShare,
    attributableEquity: equity * familyShare,
  };
}

export function allAssetEquities(db: Database): AssetEquity[] {
  return db.assets.map((a) => calculateAssetEquity(db, a));
}

export interface NetWorth {
  totalAssets: number;
  totalDebt: number;
  netWorth: number;
}

/**
 * ACTIVOS − PASIVOS = PATRIMONIO NETO, siempre en base económica (look-through).
 * La deuda no asociada a un activo (líneas giradas, deuda corporativa) se pondera
 * por la participación en la entidad deudora.
 */
export function calculateNetWorth(db: Database): NetWorth {
  const equities = allAssetEquities(db);
  const totalAssets = equities.reduce((a, e) => a + e.economicValue, 0);
  const assetLinkedDebt = equities.reduce((a, e) => a + e.economicDebt, 0);
  const unlinkedDebt = db.loans
    .filter((l) => !l.assetId)
    .reduce((a, l) => a + l.balance * familyOwnershipOfEntity(db, l.borrowerEntityId), 0);
  const drawnLines = db.creditLines.reduce((a, c) => a + c.drawn * familyOwnershipOfEntity(db, c.entityId), 0);
  const totalDebt = assetLinkedDebt + unlinkedDebt + drawnLines;
  return { totalAssets, totalDebt, netWorth: totalAssets - totalDebt };
}
