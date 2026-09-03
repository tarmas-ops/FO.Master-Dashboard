import type { CashFlowCategory, Transaction } from "@/types";
import { companies, realEstate, securities } from "./assets";
import { capitalCalls, commitments, distributions } from "./history";
import { loans } from "./loans";

const MM = 1_000_000;

/** Ledger consolidado: 24 meses históricos (realized) + 24 proyectados. */
const FIRST_HISTORICAL = "2024-09";
const FIRST_PROJECTED = "2026-09";
const MONTHS = 24;

function addMonths(yyyyMm: string, n: number): string {
  const [y, m] = yyyyMm.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthList(first: string): string[] {
  return Array.from({ length: MONTHS }, (_, i) => addMonths(first, i));
}

/** Jitter determinista ±4% para que las series mensuales no sean planas. */
function jitter(seed: number, amplitude = 0.04): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return 1 + (x - Math.floor(x) - 0.5) * 2 * amplitude;
}

let seq = 0;
function tx(
  date: string,
  entityId: string,
  category: CashFlowCategory,
  type: Transaction["type"],
  amount: number,
  description: string,
  realized: boolean,
  extra: Partial<Pick<Transaction, "assetId" | "loanId" | "account" | "currency">> = {},
): Transaction {
  seq += 1;
  return {
    id: `tx-${seq}`,
    date,
    entityId,
    category,
    type,
    amount: Math.round(amount),
    description,
    realized,
    account: extra.account ?? "Cuenta operativa",
    currency: extra.currency ?? "CLP",
    assetId: extra.assetId,
    loanId: extra.loanId,
  };
}

function build(first: string, realized: boolean, growth: number): Transaction[] {
  const out: Transaction[] = [];
  const months = monthList(first);
  months.forEach((ym, i) => {
    const day = `${ym}-05`;
    const g = 1 + growth * (i / 12);
    const month = Number(ym.slice(5, 7));

    // Arriendos y gastos operacionales por activo inmobiliario
    realEstate.forEach((re, k) => {
      if (re.grossRent === 0) return;
      const rent = (re.grossRent / 12) * g * jitter(i * 7 + k);
      out.push(tx(day, re.ownerEntityId, "ARRIENDOS", "INGRESO", rent, `Arriendo ${re.name}`, realized, { assetId: re.id, currency: re.currency }));
      const opex = ((re.grossRent - re.noi) / 12) * g * jitter(i * 11 + k);
      out.push(tx(`${ym}-20`, re.ownerEntityId, "GASTOS_OPERACIONALES", "EGRESO", opex, `Gastos operacionales ${re.name}`, realized, { assetId: re.id }));
    });

    // Servicio de deuda mensual
    loans.forEach((loan, k) => {
      const annual = loan.annualDebtService;
      const monthly = loan.amortization === "TRIMESTRAL" ? (month % 3 === 0 ? annual / 4 : 0) : annual / 12;
      if (monthly > 0) {
        out.push(tx(`${ym}-10`, loan.borrowerEntityId, "SERVICIO_DEUDA", "EGRESO", monthly * jitter(i * 3 + k, 0.01), `Servicio de deuda ${loan.bank}`, realized, { loanId: loan.id, assetId: loan.assetId, currency: loan.currency }));
      }
    });

    // Intereses de renta fija y caja
    const fixedIncome = securities.filter((s) => s.assetClass === "RENTA_FIJA");
    fixedIncome.forEach((s, k) => {
      out.push(tx(`${ym}-15`, s.ownerEntityId, "INTERESES", "INGRESO", (s.dividendsLTM / 12) * jitter(i * 5 + k, 0.02), `Intereses ${s.name}`, realized, { assetId: s.id, currency: s.currency }));
    });
    out.push(tx(`${ym}-28`, "andes", "INTERESES", "INGRESO", 0.9 * MM * jitter(i * 13, 0.1), "Intereses cuenta corriente", realized));

    // Dividendos de acciones públicas (trimestral: mar, jun, sep, dic)
    if (month % 3 === 0) {
      const publicDivs = securities.filter((s) => s.assetClass === "MERCADOS_PUBLICOS").reduce((a, s) => a + s.dividendsLTM, 0);
      out.push(tx(`${ym}-25`, "andes", "DIVIDENDOS", "INGRESO", (publicDivs / 4) * g, "Dividendos cartera de acciones", realized));
    }

    // Dividendos de empresas privadas (según participación de la entidad dueña)
    companies.forEach((co) => {
      if (co.dividendsLTM === 0) return;
      const schedule: Record<string, number[]> = {
        "co-desarrollos-cordillera": [5, 11],
        "co-logistica-andina": [4],
        "co-servicios-pacifico": [5],
      };
      const payMonths = schedule[co.id] ?? [];
      if (payMonths.includes(month)) {
        const amount = (co.dividendsLTM * co.ownershipPercentage * g) / payMonths.length;
        out.push(tx(`${ym}-18`, co.ownerEntityId, "DIVIDENDOS", "INGRESO", amount, `Dividendo ${co.name}`, realized, { assetId: co.id }));
      }
    });

    // Gastos del Family Office
    out.push(tx(`${ym}-01`, "fo", "GASTOS_FAMILY_OFFICE", "EGRESO", 7 * MM * g * jitter(i * 17, 0.05), "Gastos de administración del Family Office", realized));

    // Contribuciones territoriales (trimestral) e impuesto a la renta (abril)
    if (month % 3 === 0) {
      out.push(tx(`${ym}-30`, "pacific-re", "IMPUESTOS", "EGRESO", 12 * MM * g, "Contribuciones de bienes raíces", realized));
    }
    if (month === 4) {
      out.push(tx(`${ym}-28`, "andes", "IMPUESTOS", "EGRESO", (realized ? 120 : 135) * MM, "Impuesto a la renta anual", realized));
    }

    // CAPEX recurrente menor
    if (month % 6 === 0) {
      out.push(tx(`${ym}-22`, "pacific-re", "CAPEX", "EGRESO", 25 * MM * jitter(i * 19, 0.1), "CAPEX de mantención portafolio inmobiliario", realized, { assetId: "re-parque-los-andes" }));
    }
  });
  return out;
}

const historical: Transaction[] = [
  ...build(FIRST_HISTORICAL, true, 0.03),
  // Eventos discretos históricos
  ...capitalCalls
    .filter((c) => c.status === "PAGADO")
    .map((c) => tx(c.dueDate, c.entityId, "CAPITAL_CALLS", "EGRESO", c.amount, `Capital call ${c.fundId === "pf-pacific-pe-ii" ? "Pacific Private Equity II" : "LatAm Ventures III"}`, true, { assetId: c.fundId, currency: "USD" })),
  ...distributions.map((d) =>
    tx(d.date, "patagonia", "DISTRIBUCIONES", "INGRESO", d.amount, `Distribución ${d.fundId === "pf-andes-growth-i" ? "Andes Growth Fund I" : "Pacific Private Equity II"}`, true, { assetId: d.fundId, currency: "USD" }),
  ),
  tx("2025-11-20", "cordillera-inv", "VENTA_ACTIVOS", "INGRESO", 150 * MM, "Venta de oficina Providencia (activo desinvertido)", true),
  tx("2025-06-12", "pacific-re", "CAPEX", "EGRESO", 60 * MM, "Remodelación fachada Parque Comercial Los Andes", true, { assetId: "re-parque-los-andes" }),
  tx("2026-02-18", "pacific-re", "CAPEX", "EGRESO", 50 * MM, "Renovación cubiertas Centro Comercial Sur", true, { assetId: "re-centro-comercial-sur" }),
  tx("2026-05-08", "cordillera-inv", "CAPEX", "EGRESO", 20 * MM, "Habilitación piso 14 Oficinas Nueva Cordillera", true, { assetId: "re-oficinas-nueva-cordillera" }),
  tx("2025-01-15", "andes", "OTROS_INGRESOS", "INGRESO", 20 * MM, "Devolución de impuestos", true),
  tx("2024-11-05", "andes", "NUEVAS_INVERSIONES", "EGRESO", 200 * MM, "Compra 10% adicional Logística Andina", true, { assetId: "co-logistica-andina" }),
];

const projected: Transaction[] = [
  ...build(FIRST_PROJECTED, false, 0.03),
  ...capitalCalls
    .filter((c) => c.status === "PENDIENTE")
    .map((c) => tx(c.dueDate, c.entityId, "CAPITAL_CALLS", "EGRESO", c.amount, `Capital call proyectado ${c.fundId}`, false, { assetId: c.fundId, currency: "USD" })),
  ...commitments
    .filter((c) => c.type === "CAPEX" || c.type === "NUEVA_INVERSION" || c.type === "DEUDA")
    .map((c) =>
      tx(c.dueDate, c.entityId, c.type === "CAPEX" ? "CAPEX" : c.type === "DEUDA" ? "SERVICIO_DEUDA" : "NUEVAS_INVERSIONES", "EGRESO", c.amount, c.description, false, { assetId: c.assetId }),
    ),
  tx("2027-01-20", "patagonia", "DISTRIBUCIONES", "INGRESO", 200 * MM, "Distribución esperada Andes Growth Fund I", false, { assetId: "pf-andes-growth-i", currency: "USD" }),
  tx("2027-09-15", "patagonia", "DISTRIBUCIONES", "INGRESO", 180 * MM, "Distribución esperada Andes Growth Fund I", false, { assetId: "pf-andes-growth-i", currency: "USD" }),
  tx("2028-04-10", "patagonia", "DISTRIBUCIONES", "INGRESO", 120 * MM, "Distribución esperada Pacific Private Equity II", false, { assetId: "pf-pacific-pe-ii", currency: "USD" }),
  tx("2027-06-15", "cordillera-inv", "DESEMBOLSO_DEUDA", "INGRESO", 550 * MM, "Refinanciamiento Costa Lodge (crédito a 10 años)", false, { assetId: "re-costa-lodge" }),
];

export const transactions: Transaction[] = [...historical, ...projected].sort((a, b) => a.date.localeCompare(b.date));
