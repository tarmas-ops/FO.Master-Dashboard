/**
 * Modelo de datos del Family Office OS.
 *
 * Toda la app gira alrededor de esta cadena:
 *   Entidad → Participación → Activo → Flujo de Caja → Valorización → Retorno → Decisión
 *
 * Las páginas son vistas sobre esta misma base; ninguna página define cifras propias.
 * Montos: todos los valores monetarios se almacenan en CLP (pesos, sin escalar).
 * `currency` indica la exposición económica del activo, no la unidad de almacenamiento.
 */

export type Currency = "CLP" | "UF" | "USD";
export type Country = "CL" | "US" | "GLOBAL";

export type EntityType =
  | "FAMILY_OFFICE"
  | "HOLDING"
  | "SPV"
  | "OPERATING_COMPANY"
  | "FUND"
  | "PERSON";

export type AssetClass =
  | "INMOBILIARIO"
  | "EMPRESAS_PRIVADAS"
  | "MERCADOS_PRIVADOS"
  | "MERCADOS_PUBLICOS"
  | "RENTA_FIJA"
  | "CAJA"
  | "OTROS";

export type RealEstateType =
  | "STRIP_CENTER"
  | "INDUSTRIAL"
  | "HOSPITALITY"
  | "OFICINAS"
  | "TERRENO"
  | "RETAIL";

export type Sector =
  | "INMOBILIARIO"
  | "LOGISTICA"
  | "SERVICIOS"
  | "ENERGIA"
  | "TECNOLOGIA"
  | "FINANCIERO"
  | "CONSUMO"
  | "MATERIALES"
  | "DIVERSIFICADO";

export interface FamilyOffice {
  id: string;
  name: string;
  baseCurrency: Currency;
  rootEntityId: string;
  /** Reserva mínima de liquidez que la política exige mantener (CLP). */
  minimumLiquidityReserve: number;
  /** LTV máximo de política sobre el portafolio inmobiliario (0–1). */
  maxPolicyLTV: number;
}

export interface Person {
  id: string;
  name: string;
  role: string;
  /** Participación en el Family Office (0–1). Solo informativo para el filtro por miembro. */
  familyShare: number;
}

export interface Entity {
  id: string;
  name: string;
  entityType: EntityType;
  country: Country;
  currency: Currency;
  taxId?: string;
  description?: string;
}

/**
 * Participación directa entre dos entidades. La participación económica look-through
 * NUNCA se almacena: se calcula recursivamente con calculateLookThroughOwnership().
 */
export interface Ownership {
  id: string;
  ownerEntityId: string;
  ownedEntityId: string;
  directOwnershipPercentage: number; // 0–1
  votingOwnershipPercentage: number; // 0–1
  effectiveDate: string; // ISO date
}

export interface AssetBase {
  id: string;
  name: string;
  assetClass: AssetClass;
  subAssetClass: string;
  sector: Sector;
  country: Country;
  currency: Currency;
  /** Valor 100% del activo, en CLP. */
  currentValue: number;
  /** Costo de adquisición 100%, en CLP. */
  acquisitionCost: number;
  acquisitionDate: string;
  /** Entidad que posee el activo directamente. */
  ownerEntityId: string;
  /** Participación directa de la entidad dueña sobre el activo (0–1). */
  ownershipPercentage: number;
  valuationMethod: string;
  lastValuationDate: string;
  liquid: boolean;
}

export interface RealEstateAsset extends AssetBase {
  assetClass: "INMOBILIARIO";
  realEstateType: RealEstateType;
  location: string;
  city: string;
  surfaceM2: number;
  /** NOI anual (100%), CLP. */
  noi: number;
  /** Ingresos anuales brutos (100%), CLP. */
  grossRent: number;
  occupancy: number; // 0–1
  wale: number; // años
  tenants: Tenant[];
}

export interface Tenant {
  name: string;
  surfaceM2: number;
  monthlyRent: number;
  leaseEnd: string;
}

export interface CompanyInvestment extends AssetBase {
  assetClass: "EMPRESAS_PRIVADAS";
  revenue: number;
  ebitda: number;
  netDebt: number;
  dividendsLTM: number;
  history: Array<{ year: number; revenue: number; ebitda: number; dividends: number }>;
}

export interface PrivateFund extends AssetBase {
  assetClass: "MERCADOS_PRIVADOS";
  manager: string;
  vintage: number;
  committed: number;
  called: number;
  distributed: number;
  /** NAV actual (100% del compromiso del FO), CLP. currentValue === nav. */
  nav: number;
  strategy: string;
}

export interface PublicSecurity extends AssetBase {
  assetClass: "MERCADOS_PUBLICOS" | "RENTA_FIJA";
  ticker: string;
  issuer: string;
  shares: number;
  /** Precio unitario en la moneda del instrumento. */
  price: number;
  dividendYield: number;
  dividendsLTM: number;
}

export interface CashAccount extends AssetBase {
  assetClass: "CAJA";
  bank: string;
  accountType: string;
}

export interface OtherAsset extends AssetBase {
  assetClass: "OTROS";
}

export type Asset =
  | RealEstateAsset
  | CompanyInvestment
  | PrivateFund
  | PublicSecurity
  | CashAccount
  | OtherAsset;

export type AmortizationType = "MENSUAL" | "TRIMESTRAL" | "BULLET";
export type RateType = "FIJA" | "VARIABLE";

export interface Loan {
  id: string;
  name: string;
  bank: string;
  /** Entidad deudora. */
  borrowerEntityId: string;
  /** Activo garantizado / financiado (si aplica). */
  assetId?: string;
  /** Saldo insoluto 100%, CLP. */
  balance: number;
  originalAmount: number;
  currency: Currency;
  rate: number; // anual, 0–1
  rateType: RateType;
  amortization: AmortizationType;
  /** Plazo de amortización del cuadro de pagos (años). BULLET = solo intereses. */
  amortizationYears: number;
  maturityDate: string;
  originationDate: string;
  /** Servicio de deuda anual (intereses + amortización), CLP. */
  annualDebtService: number;
}

export interface CreditLine {
  id: string;
  bank: string;
  entityId: string;
  limit: number;
  drawn: number;
  currency: Currency;
}

export type TransactionType = "INGRESO" | "EGRESO";

export type CashFlowCategory =
  | "ARRIENDOS"
  | "DIVIDENDOS"
  | "INTERESES"
  | "DISTRIBUCIONES"
  | "VENTA_ACTIVOS"
  | "DESEMBOLSO_DEUDA"
  | "OTROS_INGRESOS"
  | "SERVICIO_DEUDA"
  | "CAPEX"
  | "CAPITAL_CALLS"
  | "IMPUESTOS"
  | "GASTOS_OPERACIONALES"
  | "GASTOS_FAMILY_OFFICE"
  | "NUEVAS_INVERSIONES";

export interface Transaction {
  id: string;
  date: string;
  entityId: string;
  assetId?: string;
  loanId?: string;
  account: string;
  category: CashFlowCategory;
  type: TransactionType;
  /** Siempre positivo; el signo lo da `type`. CLP. */
  amount: number;
  currency: Currency;
  description: string;
  /** false = movimiento proyectado. */
  realized: boolean;
}

export interface Valuation {
  id: string;
  assetId: string;
  date: string;
  value: number;
  method: string;
  /** NOI del período, para inmobiliario. */
  noi?: number;
}

export interface CapitalCall {
  id: string;
  fundId: string;
  entityId: string;
  dueDate: string;
  amount: number;
  status: "PENDIENTE" | "PAGADO";
}

export interface Distribution {
  id: string;
  fundId: string;
  date: string;
  amount: number;
}

export type CommitmentType = "CAPITAL_CALL" | "CAPEX" | "DEUDA" | "IMPUESTOS" | "NUEVA_INVERSION";

export interface Commitment {
  id: string;
  type: CommitmentType;
  description: string;
  entityId: string;
  assetId?: string;
  dueDate: string;
  amount: number;
}

export type DocumentType =
  | "LEGAL"
  | "FINANCIERO"
  | "TRIBUTARIO"
  | "TASACION"
  | "BANCO"
  | "CONTRATO_ARRIENDO"
  | "INVESTMENT_MEMO"
  | "DUE_DILIGENCE"
  | "MODELO_FINANCIERO"
  | "ESCRITURA"
  | "OTROS";

export interface DocumentRecord {
  id: string;
  name: string;
  type: DocumentType;
  entityId?: string;
  assetId?: string;
  loanId?: string;
  dealId?: string;
  uploadedAt: string;
  sizeKb: number;
}

export interface InvestmentThesis {
  investmentId: string; // assetId o dealId
  investmentDate: string;
  thesis: string;
  entryPrice: number;
  initialEquity: number;
  expectedHoldPeriod: number; // años
  targetReturn: number;
  baseCaseIRR: number;
  downsideIRR: number;
  upsideIRR: number;
  targetMOIC: number;
  targetCashOnCash: number;
  entryValuation: number;
  entryCapRate?: number;
  targetExitValuation: number;
  targetExitCapRate?: number;
  targetExitDate: string;
  expectedGrowth: number;
  exitAssumption: string;
  investmentReasons: string[];
  keyRisks: string[];
  keyCatalysts: string[];
  investmentMemo?: string;
  reviewFrequency: "TRIMESTRAL" | "SEMESTRAL" | "ANUAL";
  /** Supuestos del caso base para comparar contra la realidad. */
  expectedNOI?: number;
  expectedOccupancy?: number;
  expectedLTV?: number;
  expectedValueToday?: number;
}

export type DecisionType = "INVEST" | "HOLD" | "SELL" | "REFINANCE" | "INCREASE" | "REDUCE" | "PASS";
export type DecisionStatus = "PROPUESTA" | "APROBADA" | "RECHAZADA" | "EJECUTADA";

export interface InvestmentDecision {
  id: string;
  investmentId: string;
  decisionDate: string;
  decisionType: DecisionType;
  approvedBy: string;
  status: DecisionStatus;
  rationale: string;
  notes?: string;
  reviewDate?: string;
}

export type DealStage =
  | "ORIGINADO"
  | "EVALUACION_INICIAL"
  | "UNDERWRITING"
  | "DUE_DILIGENCE"
  | "COMITE_INVERSIONES"
  | "NEGOCIACION"
  | "CERRADO"
  | "DESCARTADO";

export interface DealScore {
  retorno: number;
  riesgo: number;
  calidadActivo: number;
  calidadContraparte: number;
  liquidez: number;
  complejidad: number;
  downsideProtection: number;
  conviccion: number;
}

export interface Deal {
  id: string;
  name: string;
  assetClass: AssetClass;
  assetType: string;
  location: string;
  country: Country;
  stage: DealStage;
  dealValue: number;
  equityRequired: number;
  debt: number;
  expectedIRR: number;
  downsideIRR: number;
  upsideIRR: number;
  expectedMOIC: number;
  cashOnCash: number;
  capRate?: number;
  source: string;
  owner: string;
  closeProbability: number; // 0–1
  summary: string;
  thesis: string;
  risks: string[];
  catalysts: string[];
  timeline: Array<{ date: string; milestone: string; done: boolean }>;
  dueDiligenceStatus: Array<{ area: string; status: "PENDIENTE" | "EN_CURSO" | "COMPLETO" }>;
  comments: Array<{ author: string; date: string; text: string }>;
  score: DealScore;
  createdAt: string;
  updatedAt: string;
}

export interface NetWorthSnapshot {
  year: number;
  netWorth: number;
  contributions: number;
  distributions: number;
  investmentGain: number;
}

export interface FxRates {
  /** CLP por UF */
  UF: number;
  /** CLP por USD */
  USD: number;
  asOf: string;
}

export interface AllocationTarget {
  assetClass: AssetClass;
  target: number; // 0–1
}

export interface Database {
  familyOffice: FamilyOffice;
  persons: Person[];
  entities: Entity[];
  ownerships: Ownership[];
  assets: Asset[];
  loans: Loan[];
  creditLines: CreditLine[];
  transactions: Transaction[];
  valuations: Valuation[];
  capitalCalls: CapitalCall[];
  distributions: Distribution[];
  commitments: Commitment[];
  documents: DocumentRecord[];
  theses: InvestmentThesis[];
  decisions: InvestmentDecision[];
  deals: Deal[];
  netWorthHistory: NetWorthSnapshot[];
  fx: FxRates;
  allocationTargets: AllocationTarget[];
  /** Fecha "hoy" del sistema para que los cálculos sean deterministas. */
  asOf: string;
}
