import type { CashFlowCategory, Database, Transaction } from "@/types";
import { familyOwnershipOfEntity } from "./ownership";

export const INCOME_CATEGORIES: CashFlowCategory[] = [
  "ARRIENDOS",
  "DIVIDENDOS",
  "INTERESES",
  "DISTRIBUCIONES",
  "VENTA_ACTIVOS",
  "DESEMBOLSO_DEUDA",
  "OTROS_INGRESOS",
];

export const EXPENSE_CATEGORIES: CashFlowCategory[] = [
  "SERVICIO_DEUDA",
  "CAPEX",
  "CAPITAL_CALLS",
  "IMPUESTOS",
  "GASTOS_OPERACIONALES",
  "GASTOS_FAMILY_OFFICE",
  "NUEVAS_INVERSIONES",
];

export const CATEGORY_LABELS: Record<CashFlowCategory, string> = {
  ARRIENDOS: "Ingresos por Arriendos",
  DIVIDENDOS: "Dividendos",
  INTERESES: "Intereses",
  DISTRIBUCIONES: "Distribuciones de Fondos",
  VENTA_ACTIVOS: "Venta de Activos",
  DESEMBOLSO_DEUDA: "Desembolsos de Deuda",
  OTROS_INGRESOS: "Otros Ingresos",
  SERVICIO_DEUDA: "Servicio de Deuda",
  CAPEX: "CAPEX",
  CAPITAL_CALLS: "Capital Calls",
  IMPUESTOS: "Impuestos",
  GASTOS_OPERACIONALES: "Gastos Operacionales",
  GASTOS_FAMILY_OFFICE: "Gastos del Family Office",
  NUEVAS_INVERSIONES: "Nuevas Inversiones",
};

/** Monto económico de un movimiento: ponderado por la participación del FO en la entidad. */
export function economicAmount(db: Database, t: Transaction): number {
  return t.amount * familyOwnershipOfEntity(db, t.entityId);
}

export interface MonthlyCashFlow {
  month: string; // YYYY-MM
  income: number;
  expenses: number;
  net: number;
  byCategory: Partial<Record<CashFlowCategory, number>>;
}

export interface CashFlowWindow {
  months: MonthlyCashFlow[];
  income: number;
  expenses: number;
  net: number;
  byCategory: Record<CashFlowCategory, number>;
}

function emptyByCategory(): Record<CashFlowCategory, number> {
  return Object.fromEntries([...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES].map((c) => [c, 0])) as Record<CashFlowCategory, number>;
}

function addMonths(yyyyMm: string, n: number): string {
  const [y, m] = yyyyMm.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Flujo de caja consolidado (económico) entre dos meses inclusive.
 * `realized` filtra histórico (true) o proyectado (false); undefined = ambos.
 */
export function calculateCashFlow(db: Database, fromMonth: string, toMonth: string, realized?: boolean): CashFlowWindow {
  const months: MonthlyCashFlow[] = [];
  let cursor = fromMonth;
  while (cursor <= toMonth) {
    months.push({ month: cursor, income: 0, expenses: 0, net: 0, byCategory: {} });
    cursor = addMonths(cursor, 1);
  }
  const index = new Map(months.map((m) => [m.month, m]));
  const totals = emptyByCategory();
  for (const t of db.transactions) {
    if (realized !== undefined && t.realized !== realized) continue;
    const m = index.get(t.date.slice(0, 7));
    if (!m) continue;
    const amt = economicAmount(db, t);
    m.byCategory[t.category] = (m.byCategory[t.category] ?? 0) + amt;
    totals[t.category] += amt;
    if (t.type === "INGRESO") m.income += amt;
    else m.expenses += amt;
    m.net = m.income - m.expenses;
  }
  const income = months.reduce((a, m) => a + m.income, 0);
  const expenses = months.reduce((a, m) => a + m.expenses, 0);
  return { months, income, expenses, net: income - expenses, byCategory: totals };
}

/** Últimos N meses cerrados hasta `asOf` (excluye el mes en curso). */
export function trailingMonths(asOf: string, n: number): { from: string; to: string } {
  const current = asOf.slice(0, 7);
  return { from: addMonths(current, -n), to: addMonths(current, -1) };
}

/** Próximos N meses desde el mes en curso inclusive. */
export function forwardMonths(asOf: string, n: number): { from: string; to: string } {
  const current = asOf.slice(0, 7);
  return { from: current, to: addMonths(current, n - 1) };
}
