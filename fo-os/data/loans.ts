import type { CreditLine, Loan } from "@/types";

const MM = 1_000_000;

/**
 * Servicio de deuda anual según cuadro de amortización (anualidad francesa) sobre el
 * plazo de amortización del crédito, no sobre el plazo remanente. BULLET = solo intereses.
 */
function debtService(balance: number, rate: number, amortization: Loan["amortization"], amortizationYears: number): number {
  if (amortization === "BULLET") return Math.round(balance * rate);
  const payment = (balance * rate) / (1 - Math.pow(1 + rate, -amortizationYears));
  return Math.round(payment);
}

type LoanSeed = Omit<Loan, "annualDebtService">;

const seeds: LoanSeed[] = [
  {
    id: "loan-parque-los-andes",
    name: "Crédito hipotecario Parque Comercial Los Andes",
    bank: "Banco Santander",
    borrowerEntityId: "pacific-re",
    assetId: "re-parque-los-andes",
    balance: 1_250 * MM,
    originalAmount: 1_500 * MM,
    currency: "UF",
    rate: 0.042,
    rateType: "FIJA",
    amortization: "MENSUAL",
    amortizationYears: 20,
    originationDate: "2019-06-01",
    maturityDate: "2031-06-01",
  },
  {
    id: "loan-centro-industrial-norte",
    name: "Crédito hipotecario Centro Industrial Norte",
    bank: "Banco de Chile",
    borrowerEntityId: "pacific-re",
    assetId: "re-centro-industrial-norte",
    balance: 750 * MM,
    originalAmount: 900 * MM,
    currency: "UF",
    rate: 0.045,
    rateType: "FIJA",
    amortization: "MENSUAL",
    amortizationYears: 20,
    originationDate: "2020-12-01",
    maturityDate: "2030-12-01",
  },
  {
    id: "loan-costa-lodge",
    name: "Crédito puente Costa Lodge",
    bank: "BCI",
    borrowerEntityId: "cordillera-inv",
    assetId: "re-costa-lodge",
    balance: 600 * MM,
    originalAmount: 600 * MM,
    currency: "CLP",
    rate: 0.098,
    rateType: "VARIABLE",
    amortization: "BULLET",
    amortizationYears: 0,
    originationDate: "2024-06-15",
    maturityDate: "2027-06-15",
  },
  {
    id: "loan-oficinas-nueva-cordillera",
    name: "Crédito hipotecario Oficinas Nueva Cordillera",
    bank: "Scotiabank",
    borrowerEntityId: "cordillera-inv",
    assetId: "re-oficinas-nueva-cordillera",
    balance: 550 * MM,
    originalAmount: 700 * MM,
    currency: "UF",
    rate: 0.048,
    rateType: "FIJA",
    amortization: "MENSUAL",
    amortizationYears: 20,
    originationDate: "2018-09-01",
    maturityDate: "2033-09-01",
  },
  {
    id: "loan-centro-comercial-sur",
    name: "Crédito hipotecario Centro Comercial Sur",
    bank: "Banco Itaú",
    borrowerEntityId: "pacific-re",
    assetId: "re-centro-comercial-sur",
    balance: 800 * MM,
    originalAmount: 850 * MM,
    currency: "UF",
    rate: 0.051,
    rateType: "VARIABLE",
    amortization: "TRIMESTRAL",
    amortizationYears: 25,
    originationDate: "2023-05-01",
    maturityDate: "2035-05-01",
  },
];

export const loans: Loan[] = seeds.map((s) => ({
  ...s,
  annualDebtService: debtService(s.balance, s.rate, s.amortization, s.amortizationYears),
}));

export const creditLines: CreditLine[] = [
  { id: "cl-andes-santander", bank: "Banco Santander", entityId: "andes", limit: 500 * MM, drawn: 0, currency: "CLP" },
  { id: "cl-patagonia-chile", bank: "Banco de Chile", entityId: "patagonia", limit: 200 * MM, drawn: 0, currency: "USD" },
];
