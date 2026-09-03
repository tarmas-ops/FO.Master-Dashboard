import type { AllocationTarget, CapitalCall, Commitment, Distribution, FxRates, NetWorthSnapshot, Valuation } from "@/types";
import { realEstate } from "./assets";

const MM = 1_000_000;

export const asOf = "2026-09-03";

export const fx: FxRates = { UF: 39_250, USD: 940, asOf: "2026-09-02" };

/**
 * Cierres anuales históricos. El año en curso (2026) no se guarda: se deriva en vivo
 * del balance actual, por lo que la serie siempre concilia con el resto de la app.
 */
export const netWorthHistory: NetWorthSnapshot[] = [
  { year: 2021, netWorth: 10_900 * MM, contributions: 0, distributions: 260 * MM, investmentGain: 1_020 * MM },
  { year: 2022, netWorth: 11_800 * MM, contributions: 0, distributions: 300 * MM, investmentGain: 1_200 * MM },
  { year: 2023, netWorth: 12_900 * MM, contributions: 0, distributions: 340 * MM, investmentGain: 1_440 * MM },
  { year: 2024, netWorth: 13_600 * MM, contributions: 0, distributions: 380 * MM, investmentGain: 1_080 * MM },
  { year: 2025, netWorth: 13_850 * MM, contributions: 0, distributions: 420 * MM, investmentGain: 670 * MM },
];

export const allocationTargets: AllocationTarget[] = [
  { assetClass: "INMOBILIARIO", target: 0.35 },
  { assetClass: "EMPRESAS_PRIVADAS", target: 0.15 },
  { assetClass: "MERCADOS_PRIVADOS", target: 0.15 },
  { assetClass: "MERCADOS_PUBLICOS", target: 0.2 },
  { assetClass: "RENTA_FIJA", target: 0.08 },
  { assetClass: "CAJA", target: 0.05 },
  { assetClass: "OTROS", target: 0.02 },
];

/**
 * Trayectoria de valorización anual por activo inmobiliario, desde el costo de
 * adquisición hasta el valor actual. Determinista; Costa Lodge cae respecto a su costo.
 */
export const valuations: Valuation[] = realEstate.flatMap((asset) => {
  // Solo los activos con costo, fecha de adquisición y NOI registrados tienen trayectoria
  // reconstruible. Si la fuente no los trae, el activo simplemente no aporta serie histórica.
  if (asset.acquisitionDate === undefined || asset.acquisitionCost === undefined || asset.noi === undefined) return [];
  const acquisitionCost = asset.acquisitionCost;
  const assetNOI = asset.noi;
  const startYear = Number(asset.acquisitionDate.slice(0, 4));
  const years = [2022, 2023, 2024, 2025, 2026].filter((y) => y >= startYear);
  const firstYear = years[0] ?? 2026;
  const span = Math.max(2026 - firstYear, 1);
  const startValue = firstYear === startYear ? acquisitionCost : acquisitionCost * Math.pow(asset.currentValue / acquisitionCost, (firstYear - startYear) / Math.max(2026 - startYear, 1));
  const noiStart = assetNOI * (asset.id === "re-costa-lodge" ? 1.35 : 0.82);
  return years.map((year, i) => {
    const t = i / span;
    const value = year === 2026 ? asset.currentValue : startValue + (asset.currentValue - startValue) * t;
    const noi = year === 2026 ? assetNOI : noiStart + (assetNOI - noiStart) * t;
    return {
      id: `val-${asset.id}-${year}`,
      assetId: asset.id,
      date: year === 2026 ? asset.lastValuationDate : `${year}-12-31`,
      value: Math.round(value),
      method: asset.valuationMethod,
      noi: Math.round(noi),
    };
  });
});

export const capitalCalls: CapitalCall[] = [
  { id: "cc-1", fundId: "pf-pacific-pe-ii", entityId: "patagonia", dueDate: "2025-11-15", amount: 120 * MM, status: "PAGADO" },
  { id: "cc-2", fundId: "pf-latam-ventures-iii", entityId: "patagonia", dueDate: "2026-04-10", amount: 100 * MM, status: "PAGADO" },
  { id: "cc-3", fundId: "pf-latam-ventures-iii", entityId: "patagonia", dueDate: "2026-11-15", amount: 100 * MM, status: "PENDIENTE" },
  { id: "cc-4", fundId: "pf-pacific-pe-ii", entityId: "patagonia", dueDate: "2027-02-28", amount: 120 * MM, status: "PENDIENTE" },
  { id: "cc-5", fundId: "pf-latam-ventures-iii", entityId: "patagonia", dueDate: "2027-06-30", amount: 100 * MM, status: "PENDIENTE" },
  { id: "cc-6", fundId: "pf-andes-growth-i", entityId: "patagonia", dueDate: "2027-10-31", amount: 150 * MM, status: "PENDIENTE" },
  { id: "cc-7", fundId: "pf-pacific-pe-ii", entityId: "patagonia", dueDate: "2028-03-31", amount: 150 * MM, status: "PENDIENTE" },
];

export const distributions: Distribution[] = [
  { id: "dist-1", fundId: "pf-andes-growth-i", date: "2024-11-20", amount: 100 * MM },
  { id: "dist-2", fundId: "pf-andes-growth-i", date: "2025-10-15", amount: 150 * MM },
  { id: "dist-3", fundId: "pf-andes-growth-i", date: "2026-03-20", amount: 130 * MM },
  { id: "dist-4", fundId: "pf-pacific-pe-ii", date: "2026-06-25", amount: 90 * MM },
];

export const commitments: Commitment[] = [
  { id: "cm-1", type: "CAPITAL_CALL", description: "Capital call LatAm Ventures III", entityId: "patagonia", assetId: "pf-latam-ventures-iii", dueDate: "2026-11-15", amount: 100 * MM },
  { id: "cm-2", type: "CAPEX", description: "Reconversión de 4 locales — Parque Comercial Los Andes", entityId: "pacific-re", assetId: "re-parque-los-andes", dueDate: "2026-11-30", amount: 80 * MM },
  { id: "cm-3", type: "NUEVA_INVERSION", description: "Equity Bodegas Quilicura (cierre estimado)", entityId: "cordillera-inv", dueDate: "2026-12-15", amount: 350 * MM },
  { id: "cm-4", type: "CAPITAL_CALL", description: "Capital call Pacific Private Equity II", entityId: "patagonia", assetId: "pf-pacific-pe-ii", dueDate: "2027-02-28", amount: 120 * MM },
  { id: "cm-5", type: "CAPEX", description: "Renovación patio de comidas — Centro Comercial Sur", entityId: "pacific-re", assetId: "re-centro-comercial-sur", dueDate: "2027-03-31", amount: 120 * MM },
  { id: "cm-6", type: "IMPUESTOS", description: "Impuesto a la renta AT 2027 (estimado)", entityId: "andes", dueDate: "2027-04-30", amount: 135 * MM },
  { id: "cm-7", type: "DEUDA", description: "Vencimiento crédito puente Costa Lodge", entityId: "cordillera-inv", assetId: "re-costa-lodge", dueDate: "2027-06-15", amount: 600 * MM },
  { id: "cm-8", type: "CAPITAL_CALL", description: "Capital call LatAm Ventures III", entityId: "patagonia", assetId: "pf-latam-ventures-iii", dueDate: "2027-06-30", amount: 100 * MM },
];
