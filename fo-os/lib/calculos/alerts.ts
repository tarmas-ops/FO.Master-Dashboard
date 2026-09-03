import type { Database } from "@/types";
import { calculateLiquidity } from "./liquidity";
import { calculateNetWorth } from "./networth";
import { familyOwnershipOfEntity } from "./ownership";
import { allPerformanceVsPlan } from "./plan";
import { realEstatePortfolio } from "./realestate";

export type AlertSeverity = "CRITICA" | "ALTA" | "MEDIA";
export type AlertKind =
  | "LTV"
  | "DSCR"
  | "CONCENTRACION"
  | "VENCIMIENTO_DEUDA"
  | "CAPITAL_CALL"
  | "IRR_BAJO_PLAN"
  | "LIQUIDEZ"
  | "TASA_VARIABLE";

export interface PortfolioAlert {
  id: string;
  kind: AlertKind;
  severity: AlertSeverity;
  title: string;
  detail: string;
  href?: string;
}

const SEVERITY_RANK: Record<AlertSeverity, number> = { CRITICA: 0, ALTA: 1, MEDIA: 2 };

export const ALERT_THRESHOLDS = {
  maxLTV: 0.65,
  minDSCR: 1.3,
  maxSingleAssetShare: 0.2,
  debtMaturityMonths: 12,
  capitalCallMonths: 3,
  variableRateWarning: 0.09,
};

function monthsUntil(date: string, asOf: string): number {
  const d = new Date(date);
  const a = new Date(asOf);
  return (d.getFullYear() - a.getFullYear()) * 12 + (d.getMonth() - a.getMonth());
}

/** Alertas del portafolio derivadas de los datos. Ordenadas por severidad; el UI muestra máximo 5. */
export function calculatePortfolioAlerts(db: Database): PortfolioAlert[] {
  const alerts: PortfolioAlert[] = [];
  const re = realEstatePortfolio(db);
  const { totalAssets } = calculateNetWorth(db);

  for (const m of re.rows) {
    if (m.ltv > ALERT_THRESHOLDS.maxLTV) {
      alerts.push({
        id: `ltv-${m.asset.id}`,
        kind: "LTV",
        severity: "ALTA",
        title: `LTV de ${Math.round(m.ltv * 100)}% en ${m.asset.name}`,
        detail: `Sobre el máximo de política (${Math.round(ALERT_THRESHOLDS.maxLTV * 100)}%).`,
        href: `/inmobiliario/${m.asset.id}`,
      });
    }
    if (m.dscr !== null && m.dscr < ALERT_THRESHOLDS.minDSCR) {
      alerts.push({
        id: `dscr-${m.asset.id}`,
        kind: "DSCR",
        severity: m.dscr < 1.1 ? "CRITICA" : "ALTA",
        title: `DSCR de ${m.dscr.toFixed(2).replace(".", ",")}x en ${m.asset.name}`,
        detail: `Bajo el mínimo de ${ALERT_THRESHOLDS.minDSCR.toFixed(1).replace(".", ",")}x: el NOI cubre ajustadamente el servicio de deuda.`,
        href: `/inmobiliario/${m.asset.id}`,
      });
    }
  }

  for (const loan of db.loans) {
    const months = monthsUntil(loan.maturityDate, db.asOf);
    if (months >= 0 && months <= ALERT_THRESHOLDS.debtMaturityMonths) {
      alerts.push({
        id: `maturity-${loan.id}`,
        kind: "VENCIMIENTO_DEUDA",
        severity: "CRITICA",
        title: `Vencimiento de deuda en ${months} meses`,
        detail: `${loan.name} (${loan.bank}) vence el ${loan.maturityDate}.`,
        href: "/deuda",
      });
    }
    if (loan.rateType === "VARIABLE" && loan.rate >= ALERT_THRESHOLDS.variableRateWarning) {
      alerts.push({
        id: `rate-${loan.id}`,
        kind: "TASA_VARIABLE",
        severity: "MEDIA",
        title: `Tasa variable elevada en ${loan.name}`,
        detail: `${(loan.rate * 100).toFixed(1).replace(".", ",")}% anual, expuesta a alzas.`,
        href: "/deuda",
      });
    }
  }

  for (const a of db.assets) {
    const share = familyOwnershipOfEntity(db, a.ownerEntityId) * a.ownershipPercentage * a.currentValue / totalAssets;
    if (share > ALERT_THRESHOLDS.maxSingleAssetShare) {
      alerts.push({
        id: `conc-${a.id}`,
        kind: "CONCENTRACION",
        severity: "ALTA",
        title: `Concentración de ${Math.round(share * 100)}% en ${a.name}`,
        detail: `Supera el ${Math.round(ALERT_THRESHOLDS.maxSingleAssetShare * 100)}% del patrimonio en un solo activo.`,
      });
    }
  }

  for (const c of db.capitalCalls) {
    if (c.status !== "PENDIENTE") continue;
    const months = monthsUntil(c.dueDate, db.asOf);
    if (months >= 0 && months <= ALERT_THRESHOLDS.capitalCallMonths) {
      const fund = db.assets.find((a) => a.id === c.fundId);
      alerts.push({
        id: `cc-${c.id}`,
        kind: "CAPITAL_CALL",
        severity: "MEDIA",
        title: `Capital call próximo: ${fund?.name ?? c.fundId}`,
        detail: `Vence el ${c.dueDate}.`,
        href: "/mercados-privados",
      });
    }
  }

  for (const p of allPerformanceVsPlan(db)) {
    if (p.status === "BAJO_PLAN") {
      alerts.push({
        id: `plan-${p.asset.id}`,
        kind: "IRR_BAJO_PLAN",
        severity: "ALTA",
        title: `${p.asset.name} bajo el caso base`,
        detail: `IRR real ${p.actualIRR !== null ? (p.actualIRR * 100).toFixed(1).replace(".", ",") + "%" : "s/d"} vs. ${(p.baseCaseIRR * 100).toFixed(1).replace(".", ",")}% esperado.`,
        href: p.asset.assetClass === "INMOBILIARIO" ? `/inmobiliario/${p.asset.id}` : undefined,
      });
    }
  }

  const liq = calculateLiquidity(db);
  if (liq.availableLiquidity < db.familyOffice.minimumLiquidityReserve) {
    alerts.push({
      id: "liquidity-reserve",
      kind: "LIQUIDEZ",
      severity: "CRITICA",
      title: "Liquidez bajo la reserva mínima",
      detail: "Caja y activos líquidos no cubren la reserva de política.",
      href: "/flujo-de-caja",
    });
  }

  return alerts.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}
