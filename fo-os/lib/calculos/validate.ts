import type { Database } from "@/types";
import { calculateEconomicExposure } from "./exposure";
import { allAssetEquities, calculateNetWorth } from "./networth";
import { calculateLookThroughOwnership } from "./ownership";
import { realEstatePortfolio } from "./realestate";

export interface ConsistencyIssue {
  level: "error" | "warning";
  check: string;
  detail: string;
}

const EPS = 1;

/**
 * Conciliación automática: si algo no cuadra, se reporta aquí en desarrollo en vez
 * de dejar que dos páginas muestren cifras distintas.
 */
export function validatePortfolioConsistency(db: Database): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = [];
  const nw = calculateNetWorth(db);

  if (Math.abs(nw.totalAssets - nw.totalDebt - nw.netWorth) > EPS) {
    issues.push({ level: "error", check: "Activos − Pasivos = Patrimonio Neto", detail: "La identidad contable no se cumple." });
  }

  const exposure = calculateEconomicExposure(db);
  const sumShares = exposure.reduce((a, e) => a + e.share, 0);
  if (Math.abs(sumShares - 1) > 1e-6) {
    issues.push({ level: "error", check: "Asignación suma 100%", detail: `Suma ${(sumShares * 100).toFixed(4)}%.` });
  }
  const sumExposure = exposure.reduce((a, e) => a + e.value, 0);
  if (Math.abs(sumExposure - nw.totalAssets) > EPS) {
    issues.push({ level: "error", check: "Exposición económica = Activos totales", detail: `Exposición ${sumExposure} vs activos ${nw.totalAssets}.` });
  }

  for (const entity of db.entities) {
    const owned = db.ownerships.filter((o) => o.ownedEntityId === entity.id).reduce((a, o) => a + o.directOwnershipPercentage, 0);
    if (owned > 1 + 1e-9) {
      issues.push({ level: "error", check: "Participación ≤ 100%", detail: `${entity.name} tiene ${(owned * 100).toFixed(1)}% de participaciones directas.` });
    }
    const lt = calculateLookThroughOwnership(db.ownerships, db.familyOffice.rootEntityId, entity.id);
    if (lt > 1 + 1e-9) {
      issues.push({ level: "error", check: "Look-through ≤ 100%", detail: `${entity.name}: ${(lt * 100).toFixed(1)}%.` });
    }
  }

  for (const eq of allAssetEquities(db)) {
    if (eq.grossDebt > eq.grossValue + EPS) {
      issues.push({ level: "warning", check: "Deuda ≤ valor del activo", detail: `${eq.asset.name}: deuda ${eq.grossDebt} > valor ${eq.grossValue}.` });
    }
    if (Math.abs(eq.grossValue - eq.grossDebt - eq.equity) > EPS) {
      issues.push({ level: "error", check: "Equity = valor − deuda", detail: eq.asset.name });
    }
    if (eq.familyShare <= 0 || eq.familyShare > 1 + 1e-9) {
      issues.push({ level: "error", check: "Participación económica válida", detail: `${eq.asset.name}: ${eq.familyShare}.` });
    }
  }

  const re = realEstatePortfolio(db);
  const reFromExposure = exposure.find((e) => e.key === "INMOBILIARIO")?.value ?? 0;
  if (Math.abs(re.economicValue - reFromExposure) > EPS) {
    issues.push({ level: "error", check: "Inmobiliario concilia entre módulos", detail: `Portafolio ${re.economicValue} vs exposición ${reFromExposure}.` });
  }

  for (const f of db.assets) {
    if (f.assetClass === "MERCADOS_PRIVADOS") {
      if (f.called > f.committed + EPS) issues.push({ level: "error", check: "Capital llamado ≤ comprometido", detail: f.name });
      if (Math.abs(f.nav - f.currentValue) > EPS) issues.push({ level: "error", check: "NAV = valor actual", detail: f.name });
      const paidCalls = db.capitalCalls.filter((c) => c.fundId === f.id && c.status === "PAGADO").reduce((a, c) => a + c.amount, 0);
      if (paidCalls > f.called + EPS) issues.push({ level: "error", check: "Capital calls pagados ≤ capital llamado", detail: f.name });
      const dists = db.distributions.filter((d) => d.fundId === f.id).reduce((a, d) => a + d.amount, 0);
      if (dists > f.distributed + EPS) issues.push({ level: "error", check: "Distribuciones registradas ≤ distribuido", detail: f.name });
      const pendingCalls = db.capitalCalls.filter((c) => c.fundId === f.id && c.status === "PENDIENTE").reduce((a, c) => a + c.amount, 0);
      if (pendingCalls > f.committed - f.called + EPS) issues.push({ level: "warning", check: "Capital calls pendientes ≤ capital pendiente", detail: f.name });
    }
  }

  for (const t of db.transactions) {
    if (t.amount < 0) issues.push({ level: "error", check: "Movimientos con monto positivo", detail: t.id });
    if (!db.entities.some((e) => e.id === t.entityId)) issues.push({ level: "error", check: "Movimiento con entidad válida", detail: t.id });
  }

  for (const o of db.ownerships) {
    if (!db.entities.some((e) => e.id === o.ownerEntityId) || !db.entities.some((e) => e.id === o.ownedEntityId)) {
      issues.push({ level: "error", check: "Participaciones referencian entidades existentes", detail: o.id });
    }
  }
  for (const a of db.assets) {
    if (!db.entities.some((e) => e.id === a.ownerEntityId)) {
      issues.push({ level: "error", check: "Activo con entidad dueña existente", detail: a.name });
    }
  }
  for (const l of db.loans) {
    if (l.assetId && !db.assets.some((a) => a.id === l.assetId)) {
      issues.push({ level: "error", check: "Crédito con activo existente", detail: l.name });
    }
  }

  return issues;
}
