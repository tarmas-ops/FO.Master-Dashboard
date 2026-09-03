import type { Database, PrivateFund } from "@/types";

export interface CashFlowPoint {
  date: string;
  amount: number; // negativo = aporte, positivo = retorno
}

function yearFraction(from: string, to: string): number {
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  return (b - a) / (365.25 * 24 * 3600 * 1000);
}

/**
 * IRR anualizada (XIRR) por Newton-Raphson con bisección de respaldo.
 * Devuelve null si no converge o no hay cambio de signo.
 */
export function calculateIRR(flows: CashFlowPoint[]): number | null {
  if (flows.length < 2) return null;
  const sorted = [...flows].sort((a, b) => a.date.localeCompare(b.date));
  const t0 = sorted[0].date;
  const hasNeg = sorted.some((f) => f.amount < 0);
  const hasPos = sorted.some((f) => f.amount > 0);
  if (!hasNeg || !hasPos) return null;
  const npv = (r: number) => sorted.reduce((acc, f) => acc + f.amount / Math.pow(1 + r, yearFraction(t0, f.date)), 0);

  let lo = -0.99;
  let hi = 10;
  let fLo = npv(lo);
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fMid = npv(mid);
    if (Math.abs(fMid) < 1e-6) return mid;
    if (fLo * fMid < 0) {
      hi = mid;
    } else {
      lo = mid;
      fLo = fMid;
    }
  }
  return (lo + hi) / 2;
}

export function calculateMOIC(totalValue: number, invested: number): number {
  return invested > 0 ? totalValue / invested : 0;
}

export function calculateDPI(distributed: number, called: number): number {
  return called > 0 ? distributed / called : 0;
}

export function calculateTVPI(distributed: number, nav: number, called: number): number {
  return called > 0 ? (distributed + nav) / called : 0;
}

export interface FundMetrics {
  fund: PrivateFund;
  pending: number;
  moic: number;
  dpi: number;
  tvpi: number;
  irr: number | null;
}

/** IRR del fondo a partir de capital calls pagados, distribuciones y NAV terminal. */
export function fundMetrics(db: Database, fund: PrivateFund): FundMetrics {
  const calls = db.capitalCalls.filter((c) => c.fundId === fund.id && c.status === "PAGADO");
  const dists = db.distributions.filter((d) => d.fundId === fund.id);
  const calledViaLedger = calls.reduce((a, c) => a + c.amount, 0);
  const flows: CashFlowPoint[] = [
    // Capital llamado antes del inicio del ledger se asume al cierre del año de vintage
    { date: `${fund.vintage}-12-31`, amount: -(fund.called - calledViaLedger) },
    ...calls.map((c) => ({ date: c.dueDate, amount: -c.amount })),
    ...dists.map((d) => ({ date: d.date, amount: d.amount })),
    { date: db.asOf, amount: fund.nav },
  ].filter((f) => f.amount !== 0);
  return {
    fund,
    pending: fund.committed - fund.called,
    moic: calculateMOIC(fund.distributed + fund.nav, fund.called),
    dpi: calculateDPI(fund.distributed, fund.called),
    tvpi: calculateTVPI(fund.distributed, fund.nav, fund.called),
    irr: calculateIRR(flows),
  };
}

export interface PrivateMarketsSummary {
  rows: FundMetrics[];
  committed: number;
  called: number;
  nav: number;
  distributed: number;
  pending: number;
  moic: number;
  dpi: number;
  tvpi: number;
  irr: number | null;
}

export function privateMarketsSummary(db: Database): PrivateMarketsSummary {
  const funds = db.assets.filter((a): a is PrivateFund => a.assetClass === "MERCADOS_PRIVADOS");
  const rows = funds.map((f) => fundMetrics(db, f));
  const committed = funds.reduce((a, f) => a + f.committed, 0);
  const called = funds.reduce((a, f) => a + f.called, 0);
  const nav = funds.reduce((a, f) => a + f.nav, 0);
  const distributed = funds.reduce((a, f) => a + f.distributed, 0);
  const allFlows: CashFlowPoint[] = funds.flatMap((f) => {
    const calls = db.capitalCalls.filter((c) => c.fundId === f.id && c.status === "PAGADO");
    const calledViaLedger = calls.reduce((a, c) => a + c.amount, 0);
    return [
      { date: `${f.vintage}-12-31`, amount: -(f.called - calledViaLedger) },
      ...calls.map((c) => ({ date: c.dueDate, amount: -c.amount })),
      ...db.distributions.filter((d) => d.fundId === f.id).map((d) => ({ date: d.date, amount: d.amount })),
      { date: db.asOf, amount: f.nav },
    ];
  });
  return {
    rows,
    committed,
    called,
    nav,
    distributed,
    pending: committed - called,
    moic: calculateMOIC(distributed + nav, called),
    dpi: calculateDPI(distributed, called),
    tvpi: calculateTVPI(distributed, nav, called),
    irr: calculateIRR(allFlows.filter((f) => f.amount !== 0)),
  };
}

/**
 * IRR de un activo directo: equity inicial (negativo en la fecha de inversión),
 * flujos netos anuales recibidos (NOI − servicio de deuda, aproximado) y equity actual
 * como valor terminal.
 */
export function directAssetIRR(
  investmentDate: string,
  initialEquity: number,
  annualNetCash: number,
  currentEquity: number,
  asOf: string,
): number | null {
  const years = Math.floor(yearFraction(investmentDate, asOf));
  const flows: CashFlowPoint[] = [{ date: investmentDate, amount: -initialEquity }];
  for (let y = 1; y <= years; y++) {
    const d = new Date(investmentDate);
    d.setFullYear(d.getFullYear() + y);
    flows.push({ date: d.toISOString().slice(0, 10), amount: annualNetCash });
  }
  flows.push({ date: asOf, amount: currentEquity });
  return calculateIRR(flows);
}

/** IRR sin apalancamiento: costo total como aporte, NOI anual, valor actual terminal. */
export function unleveredAssetIRR(investmentDate: string, acquisitionCost: number, annualNOI: number, currentValue: number, asOf: string): number | null {
  return directAssetIRR(investmentDate, acquisitionCost, annualNOI, currentValue, asOf);
}
