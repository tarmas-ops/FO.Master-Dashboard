/**
 * Convierte los datos leídos de la planilla en el `Database` del Family Office OS.
 *
 * Es el equivalente en TypeScript de scripts/export_real_dataset.py y sigue sus mismos pasos
 * y el mismo orden: `scripts/check-parity.ts` compara el resultado de ambos sobre el mismo
 * Excel y falla si difieren.
 *
 * Principio: solo se carga lo que la planilla contiene. Lo que no trae (NOI, ocupación,
 * hipotecas por activo, fondos privados, costo de adquisición) se omite en vez de rellenarse
 * con ceros, y se declara en `dataCoverage.gaps` para que la app explique qué falta.
 */
import type {
  Asset,
  CashFlowCategory,
  DataCoverage,
  Database,
  Entity,
  EntityType,
  Loan,
  Ownership,
  Person,
  RentStream,
  Transaction,
} from "@/types";
import { clean, mm1, num, pyRound, slug } from "./cells";
import type { RentMappingEntry, SourceData } from "./source";

const ROOT_ENTITY_ID = "fo";

type Gap = DataCoverage["gaps"][number];

// El Excel no trae un grafo societario entidad→entidad: solo el titular de cada activo y el %
// de participación de la familia sobre él. Se modela en un nivel: Family Office → titular
// (100%), y el activo cuelga del titular con el % que trae la planilla. Eso reproduce el
// "Valor Atribuible" que ya calcula la planilla, sin inventar sociedades intermedias.
const TITULAR_ALIASES: Record<string, string> = {
  "cristian armas & paula alvear": "Cristián Armas & Paula Alvear",
  "cristián armas & paula alvear": "Cristián Armas & Paula Alvear",
  praga: "Praga S.A.",
  "praga s.a.": "Praga S.A.",
  nv: "NV SPA",
  "nv spa": "NV SPA",
  "nv punta lobos": "NV Punta Lobos",
  "meme spa": "Inversiones Meme Ltda",
  "inversiones meme ltda": "Inversiones Meme Ltda",
  fo: "Family Office",
  familia: "Family Office",
  "familia (caja)": "Family Office",
  "san salvador": "Inversiones San Salvador SPA",
};

function canonicalTitular(raw: unknown): string {
  const name = clean(raw) ?? "Sin titular identificado";
  return TITULAR_ALIASES[name.toLowerCase()] ?? name;
}

class EntityRegistry {
  entities = new Map<string, Entity>([
    [
      ROOT_ENTITY_ID,
      {
        id: ROOT_ENTITY_ID,
        name: "Family Office",
        entityType: "FAMILY_OFFICE",
        country: "CL",
        currency: "CLP",
        description: "Perímetro consolidado: núcleo familiar + hijos.",
      },
    ],
  ]);
  ownerships: Ownership[] = [];

  ensure(name: unknown, entityType: EntityType = "HOLDING", taxId: string | null = null): string {
    const canonical = canonicalTitular(name);
    if (canonical === "Family Office") return ROOT_ENTITY_ID;
    const eid = `e-${slug(canonical)}`;
    const existing = this.entities.get(eid);
    if (!existing) {
      this.entities.set(eid, {
        id: eid,
        name: canonical,
        entityType,
        country: "CL",
        currency: "CLP",
        ...(taxId ? { taxId } : {}),
      });
      // La planilla no informa el % de la familia sobre cada sociedad titular; el porcentaje
      // conocido está a nivel de activo. Se registra 100% aquí para no duplicar el descuento.
      this.ownerships.push({
        id: `o-${slug(canonical)}`,
        ownerEntityId: ROOT_ENTITY_ID,
        ownedEntityId: eid,
        directOwnershipPercentage: 1,
        votingOwnershipPercentage: 1,
        effectiveDate: "2026-01-01",
      });
    } else if (taxId && !existing.taxId) {
      existing.taxId = taxId;
    }
    return eid;
  }
}

function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(Math.min(d, 28)).padStart(2, "0")}`;
}

const INCOME_MAP: Array<[string[], CashFlowCategory]> = [
  [["ARRIENDO"], "ARRIENDOS"],
  [["PENSION", "SUELDO", "CLASES"], "OTROS_INGRESOS"],
  [["RETIRO", "PAGOS", "PAGO"], "DIVIDENDOS"],
  [["INTERES"], "INTERESES"],
];
const EXPENSE_MAP: Array<[string[], CashFlowCategory]> = [
  [["DIVIDENDO", "CREDITO", "PAGO DIVIDENDO"], "SERVICIO_DEUDA"],
  [["CONTRIBUCION", "IMPUESTO", "PATENTE"], "IMPUESTOS"],
  [["COMPRA", "ARREGLO", "REMODEL"], "CAPEX"],
  [["HONORARIO", "CONTABILIDAD", "FO"], "GASTOS_FAMILY_OFFICE"],
];

function mapCategory(label: string, isIncome: boolean): CashFlowCategory {
  const up = label.toUpperCase();
  for (const [keys, cat] of isIncome ? INCOME_MAP : EXPENSE_MAP) if (keys.some((k) => up.includes(k))) return cat;
  return isIncome ? "OTROS_INGRESOS" : "GASTOS_OPERACIONALES";
}

// Mapeo entre las líneas del Balance de la planilla y las clases de activo cargadas.
const BALANCE_TO_CLASS: Record<string, string[]> = {
  Liquidez: ["CAJA"],
  "Inversiones Financieras": ["MERCADOS_PUBLICOS", "RENTA_FIJA"],
  "Bienes Raíces": ["INMOBILIARIO"],
  "Empresas (Equity)": ["EMPRESAS_PRIVADAS"],
  "Otros Activos (CxC + menores)": ["OTROS"],
};

function rentStreams(
  transactions: Transaction[],
  assets: Asset[],
  asOf: string,
  mapping: RentMappingEntry[],
  gaps: Gap[],
): RentStream[] {
  const horizon = addMonths(asOf, 12);
  const window = transactions.filter((t) => asOf < t.date && t.date <= horizon && t.type === "INGRESO");
  const realEstate = assets.filter((a) => a.assetClass === "INMOBILIARIO");
  const streams: RentStream[] = [];
  const claimed = new Set<string>();
  mapping.forEach((entry, i) => {
    const concept = entry.concept.toUpperCase();
    const matched = window.filter((t) => t.description.toUpperCase().includes(concept));
    if (matched.length === 0) return;
    const assetIds = realEstate
      .filter((a) => entry.match.some((m) => a.name.toLowerCase().includes(m.toLowerCase())))
      .map((a) => a.id);
    matched.forEach((t) => claimed.add(t.id));
    streams.push({
      id: `rent-${i}`,
      concept: entry.concept,
      annualRent: pyRound(matched.reduce((a, t) => a + t.amount, 0)),
      assetIds,
      status: entry.status,
      note: entry.note,
    });
  });
  // Cualquier arriendo del flujo que el mapeo no cubra se informa en vez de perderse.
  const leftovers = new Map<string, number>();
  for (const t of window) {
    if (t.category === "ARRIENDOS" && !claimed.has(t.id)) leftovers.set(t.description, (leftovers.get(t.description) ?? 0) + t.amount);
  }
  for (const [description, amount] of leftovers) {
    streams.push({
      id: `rent-extra-${slug(description).slice(0, 24)}`,
      concept: description,
      annualRent: pyRound(amount),
      assetIds: [],
      status: "SIN_IDENTIFICAR",
      note: "Concepto de arriendo del flujo sin vínculo en la pestaña Mapeo_Arriendos.",
    });
  }
  const unidentified = streams.filter((s) => s.status === "SIN_IDENTIFICAR");
  if (unidentified.length > 0) {
    const total = unidentified.reduce((a, s) => a + s.annualRent, 0);
    const names = unidentified.map((s) => `${s.concept} ($${mm1(s.annualRent)} MM)`).join(", ");
    gaps.push({
      module: "Flujo de caja",
      field: "Arriendos sin propiedad identificada",
      detail: `$${mm1(total)} MM/año de arriendo no calza con ninguna propiedad cargada: ${names}. O faltan propiedades en Bienes_Raices, o llevan otro nombre.`,
    });
  }
  return streams;
}

export interface TransformOptions {
  /** Cuándo se generó la lectura de la planilla (ISO). */
  generatedAt: string;
  /** Nombre de la fuente que se muestra en la app. */
  sourceLabel: string;
  /** Mapeo de arriendos a usar si la planilla no trae la pestaña Mapeo_Arriendos. */
  rentMappingFallback: RentMappingEntry[];
}

export function transform(source: SourceData, options: TransformOptions): Database {
  const loadedAt = options.generatedAt.replace("T", " ").slice(0, 16);
  const corteBalance = source.supuestos.fechaCorteBalance;
  const asOf = corteBalance ?? loadedAt.slice(0, 10);
  const reg = new EntityRegistry();
  const assets: Asset[] = [];
  const gaps: Gap[] = [];
  const gap = (module: string, field: string, detail: string) => gaps.push({ module, field, detail });

  // ---------------- Bienes raíces ---------------- //
  const sinValor: string[] = [];
  for (const row of source.bienesRaices) {
    const name = row.direccion ?? `Propiedad ${row.id}`;
    if (row.valorBalance === null) {
      sinValor.push(name);
      continue;
    }
    const entityId = reg.ensure(clean(row.titular) ?? "Sin titular identificado", "SPV");
    const comuna = clean(row.comuna);
    assets.push({
      id: `re-${row.id}-${slug(name).slice(0, 40)}`,
      name,
      assetClass: "INMOBILIARIO",
      subAssetClass: row.tipo ?? "Inmueble",
      sector: "INMOBILIARIO",
      country: "CL",
      currency: "CLP",
      currentValue: row.valorBalance,
      ownerEntityId: entityId,
      ownershipPercentage: row.pct || 1,
      valuationMethod: clean(row.fuente) ?? "Sin método declarado",
      // Tasación comercial = TASADO; "avalúo fiscal × factor" es un proxy. La fecha de la
      // tasación no está en la planilla, así que no se informa una.
      valuationQuality: row.tasacion !== null ? "TASADO" : "PROXY",
      liquid: false,
      location: [row.direccion, comuna].filter((x): x is string => Boolean(x)).join(", ") || "Sin dirección",
      city: comuna ?? "Sin comuna",
      tenants: [],
      ...(row.superficie ? { surfaceM2: row.superficie } : {}),
      sourceNotes: {
        avaluoFiscal: row.avaluo,
        tasacionComercial: row.tasacion,
        rolSII: clean(row.rolSII),
        participacionConfirmada: row.pctConfirmado,
      },
    });
  }
  if (sinValor.length > 0) gap("Inmobiliario", "Propiedades sin valor", `No se cargaron por no tener tasación ni avalúo: ${sinValor.join(", ")}.`);
  const realEstateAssets = assets.filter((a) => a.assetClass === "INMOBILIARIO");
  const proxies = realEstateAssets.filter((a) => a.valuationQuality === "PROXY").length;
  if (proxies > 0) {
    gap("Inmobiliario", "Tasaciones comerciales", `${proxies} de ${realEstateAssets.length} propiedades se valoran con avalúo fiscal × factor, un proxy; el valor real puede diferir.`);
  }
  if (!corteBalance) {
    gap("General", "Fecha de corte", "La planilla no declara fecha de corte del balance; se usó la fecha de procesamiento, que no es la fecha de los datos.");
  }
  if (!source.supuestos.tcUSD) {
    gap("General", "Tipo de cambio USD/CLP", "La hoja Supuestos lo marca como PENDIENTE; sin él no se puede medir la exposición en dólares.");
  }
  gap("Inmobiliario", "NOI, arriendos, ocupación, WALE, arrendatarios", "El Excel no registra datos operacionales de las propiedades, solo su valorización.");
  gap("Inmobiliario", "Costo de adquisición", "No hay costo histórico por propiedad, por lo que no se puede calcular ganancia no realizada ni IRR.");
  gap("Deuda", "Créditos hipotecarios por activo", "El único pasivo del Excel son patentes comerciales morosas; no hay deuda asociada a los inmuebles, así que no hay LTV ni DSCR.");

  // ---------------- Empresas ---------------- //
  for (const row of source.empresas) {
    const { empresa: name, pct, patrimonio, equity } = row;
    // `currentValue` es el valor del 100% de la sociedad; el % va aparte. Usar el equity
    // value aquí volvería a aplicar el descuento de participación.
    const value100 = patrimonio !== null ? patrimonio : pct ? equity / pct : equity;
    const entityId = reg.ensure(name, "OPERATING_COMPANY", row.rutConfirmado ? clean(row.rut) : null);
    assets.push({
      id: `co-${slug(name).slice(0, 44)}`,
      name,
      assetClass: "EMPRESAS_PRIVADAS",
      subAssetClass: "Participación societaria",
      sector: "DIVERSIFICADO",
      country: "CL",
      currency: "CLP",
      currentValue: value100,
      ownerEntityId: entityId,
      ownershipPercentage: pct ?? 1,
      valuationMethod: equity ? "% participación × patrimonio contable" : "Sin EEFF cargados",
      valuationQuality: patrimonio !== null ? "CONTABLE" : "SIN_DATO",
      liquid: false,
      history: [],
      sourceNotes: {
        rut: clean(row.rut),
        rutConfirmado: row.rutConfirmado,
        patrimonioContable: patrimonio,
        participacionInformada: pct !== null,
      },
    });
  }
  const sinEEFF = source.empresas.filter((e) => e.patrimonio === null).length;
  gap("Empresas", "Ingresos, EBITDA, deuda neta, dividendos", "El Excel solo registra % de participación y patrimonio contable; no hay estados financieros.");
  gap("Empresas", "Patrimonio contable", `${sinEEFF} de ${source.empresas.length} sociedades no tienen EEFF cargados, por lo que su equity value es $0 y el patrimonio real es mayor al mostrado.`);

  // ---------------- Liquidez ---------------- //
  // La planilla consolida solo el núcleo familiar + hijos (decisión declarada del cliente):
  // las cuentas de sociedades y de personas fuera del núcleo no suman al patrimonio.
  source.liquidez.forEach((row, i) => {
    const perimetro = clean(row.perimetro) ?? "Familia";
    if (row.monto === null || !row.label || perimetro !== "Familia") return;
    const entityId = reg.ensure(clean(row.titular) ?? "Family Office", "HOLDING");
    assets.push({
      id: `cash-${i}-${slug(row.label).slice(0, 36)}`,
      name: row.label,
      assetClass: "CAJA",
      subAssetClass: "Cuenta o efectivo",
      sector: "FINANCIERO",
      country: "CL",
      currency: "CLP",
      currentValue: row.monto,
      ownerEntityId: entityId,
      ownershipPercentage: 1,
      valuationMethod: "Saldo declarado",
      lastValuationDate: asOf,
      valuationQuality: "SALDO",
      liquid: true,
      bank: clean(row.titular) ?? "Sin identificar",
      accountType: perimetro,
      sourceNotes: { perimetro, nota: clean(row.nota) },
    });
  });

  // ---------------- Inversiones financieras ---------------- //
  source.inversiones.forEach((row, i) => {
    const perimetro = clean(row.perimetro) ?? "Familia";
    if (row.monto === null || !row.label || perimetro !== "Familia") return;
    const entityId = reg.ensure(clean(row.titular) ?? "Family Office", "HOLDING");
    assets.push({
      id: `fin-${i}-${slug(row.label).slice(0, 36)}`,
      name: row.label,
      assetClass: "MERCADOS_PUBLICOS",
      subAssetClass: clean(row.nota) ?? "Instrumento financiero",
      sector: "FINANCIERO",
      country: "CL",
      currency: "CLP",
      currentValue: row.monto,
      ownerEntityId: entityId,
      ownershipPercentage: 1,
      valuationMethod: "Valor declarado",
      lastValuationDate: asOf,
      valuationQuality: "SALDO",
      liquid: true,
      ticker: slug(row.label).slice(0, 12).toUpperCase(),
      issuer: clean(row.titular) ?? "Sin identificar",
      sourceNotes: { perimetro, nota: clean(row.nota) },
    });
  });
  gap("Mercados Públicos", "Cantidad, precio, dividendos, costo", "El Excel registra el monto total de cada posición, no el número de unidades ni su precio.");
  gap("Mercados Privados", "Fondos, capital calls, NAV, vintage", "El Excel no registra compromisos en fondos privados, por lo que MOIC, DPI, TVPI e IRR no son calculables.");

  // ---------------- Otras partidas ---------------- //
  source.cuentasPorCobrar.forEach((row, i) => {
    if (!row.monto) return;
    assets.push({
      id: `oth-cxc-${i}`,
      name: row.concepto || `Cuenta por cobrar ${i}`,
      assetClass: "OTROS",
      subAssetClass: "Cuenta por cobrar operacional",
      sector: "FINANCIERO",
      country: "CL",
      currency: "CLP",
      currentValue: row.monto,
      ownerEntityId: ROOT_ENTITY_ID,
      ownershipPercentage: 1,
      valuationMethod: "Valor nominal",
      lastValuationDate: asOf,
      valuationQuality: "SALDO",
      liquid: false,
    });
  });
  source.otrosMenores.forEach((row, i) => {
    if (!row.monto) return;
    assets.push({
      id: `oth-menor-${i}`,
      name: row.concepto || `Otro activo ${i}`,
      assetClass: "OTROS",
      subAssetClass: "Activo menor",
      sector: "DIVERSIFICADO",
      country: "CL",
      currency: "CLP",
      currentValue: row.monto,
      ownerEntityId: ROOT_ENTITY_ID,
      ownershipPercentage: 1,
      valuationMethod: "Valor declarado",
      lastValuationDate: asOf,
      valuationQuality: "SALDO",
      liquid: false,
    });
  });

  // ---------------- Pasivos ---------------- //
  const loans: Loan[] = [];
  source.pasivos.forEach((row, i) => {
    const empresa = clean(row.empresa);
    if (!row.deuda || !empresa) return;
    const entityId = reg.ensure(empresa, "OPERATING_COMPANY", clean(row.rut));
    const comuna = clean(row.comuna);
    loans.push({
      id: `loan-patente-${i}`,
      name: `Patente comercial morosa — ${empresa}`,
      bank: comuna ? `Municipalidad de ${comuna}` : "Municipalidad",
      borrowerEntityId: entityId,
      balance: row.deuda,
      originalAmount: row.deuda,
      currency: "CLP",
      rate: 0,
      rateType: "FIJA",
      amortization: "BULLET",
      amortizationYears: 0,
      // La planilla registra la patente como morosa, no su fecha de vencimiento: no se inventa
      // una. `delinquent` es lo que realmente sabemos.
      delinquent: true,
      annualDebtService: row.deuda,
    });
  });
  gap("Deuda", "Tasas, plazos y calendario de vencimientos", "Las patentes morosas son deuda exigible sin tasa ni cuadro de amortización declarados.");

  // ---------------- Flujo de caja ---------------- //
  const transactions: Transaction[] = [];
  let seq = 0;
  const addTx = (month: string, category: CashFlowCategory, type: "INGRESO" | "EGRESO", amount: number | null, description: string) => {
    if (amount === null || Math.abs(amount) < 1) return;
    seq += 1;
    transactions.push({
      id: `tx-${seq}`,
      date: `${month.slice(0, 7)}-15`,
      entityId: ROOT_ENTITY_ID,
      account: "Flujo consolidado",
      category,
      type,
      amount: Math.abs(amount),
      currency: "CLP",
      description,
      realized: month.slice(0, 10) <= asOf,
    });
  };
  for (const [concept, series] of source.flujo.ingresos) {
    const label = concept.trim();
    const category = mapCategory(label, true);
    series.forEach((value, k) => addTx(source.flujo.meses[k], category, "INGRESO", num(value), label));
  }
  for (const [concept, series] of source.flujo.egresos) {
    const label = concept.trim();
    const category = mapCategory(label, false);
    series.forEach((value, k) => addTx(source.flujo.meses[k], category, "EGRESO", num(value), label));
  }

  // ---------------- Flujos de arriendo ---------------- //
  // El flujo de caja trae arriendos por concepto, no por propiedad. Se vinculan por nombre con
  // el mapeo de la pestaña Mapeo_Arriendos y cada vínculo declara su estado: nada se reparte
  // entre propiedades por la fuerza.
  const mapping = source.mapeoArriendos ?? options.rentMappingFallback;
  const rent = rentStreams(transactions, assets, asOf, mapping, gaps);

  // Partidas del flujo que no se comportan como caja operativa. No se excluyen en silencio
  // (eso sería decidir por el cliente): se informan con su monto para que se revisen.
  const horizon = addMonths(asOf, 12);
  const inWindow = transactions.filter((t) => asOf < t.date && t.date <= horizon);
  const inflacion = inWindow
    .filter((t) => t.description.toUpperCase().replace("Ó", "O").includes("EFECTO INFLACION"))
    .reduce((a, t) => a + t.amount, 0);
  if (inflacion) {
    gaps.push({
      module: "Flujo de caja",
      field: "'Efecto Inflación' contado como ingreso",
      detail: `$${mm1(inflacion)} MM en los próximos 12 meses figuran como ingreso, pero un ajuste por inflación no es caja. Infla los ingresos y el flujo neto proyectado.`,
    });
  }
  const valle = inWindow.filter((t) => t.description.toUpperCase().includes("VALLE CENTRO")).reduce((a, t) => a + t.amount, 0);
  if (valle) {
    gaps.push({
      module: "Flujo de caja",
      field: "Cuotas de 'Valle Centro' como dividendos",
      detail: `$${mm1(valle)} MM/año de un pago en 110 cuotas se clasifican como dividendos; parece una cuenta por cobrar, no un retiro de empresa.`,
    });
  }

  // "Dividendo" en Chile es la cuota de un crédito hipotecario. Si el flujo la paga pero la
  // hoja de pasivos no registra ningún crédito, el patrimonio neto está sobrestimado por el
  // saldo insoluto de esa deuda. No se estima el saldo (faltan tasa y plazo): se informa.
  const servicio = new Map<string, number>();
  for (const t of inWindow) {
    if (t.category === "SERVICIO_DEUDA" && t.type === "EGRESO") servicio.set(t.description, (servicio.get(t.description) ?? 0) + t.amount);
  }
  if (servicio.size > 0 && !loans.some((l) => !l.delinquent)) {
    const total = [...servicio.values()].reduce((a, v) => a + v, 0);
    const top = [...servicio.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k, v]) => `${k} ($${mm1(v)} MM)`)
      .join(", ");
    gaps.push({
      module: "Deuda",
      field: "Servicio de deuda sin pasivo registrado",
      detail: `El flujo de caja paga $${mm1(total)} MM/año en cuotas de crédito (${top}), pero la hoja Pasivos solo registra patentes morosas. Si esos créditos existen, el patrimonio neto está sobrestimado por su saldo insoluto.`,
    });
  }

  // Problemas de lectura de la planilla (p. ej. filas bajo el TOTAL): visibles en la app.
  for (const warning of source.warnings) gaps.push({ module: "Calidad de datos", field: "Filas no leídas", detail: warning });

  const persons: Person[] = source.personas.map((p) => ({
    id: `p-${slug(p.persona)}`,
    name: p.persona,
    role: p.rol ?? "Miembro",
    familyShare: 0,
  }));

  // ---------------- Conciliación contra el balance de la planilla ---------------- //
  const reconciliation = source.balance.distribucion.flatMap((line) => {
    const classes = BALANCE_TO_CLASS[line.clase.trim()];
    if (!classes || line.monto === null) return [];
    const app = assets.filter((a) => classes.includes(a.assetClass)).reduce((acc, a) => acc + a.currentValue * a.ownershipPercentage, 0);
    return [{ concept: line.clase.trim(), excel: line.monto, app, difference: app - line.monto }];
  });

  return {
    familyOffice: {
      id: "fo",
      name: "Family Office — Grupo Familiar",
      baseCurrency: "CLP",
      rootEntityId: ROOT_ENTITY_ID,
      minimumLiquidityReserve: 0,
      maxPolicyLTV: 0.65,
    },
    persons,
    entities: [...reg.entities.values()],
    ownerships: reg.ownerships,
    assets,
    loans,
    creditLines: [],
    transactions,
    valuations: [],
    capitalCalls: [],
    distributions: [],
    commitments: [],
    documents: [],
    theses: [],
    decisions: [],
    deals: [],
    netWorthHistory: [],
    rentStreams: rent,
    fx: { UF: source.supuestos.valorUF || 0, USD: source.supuestos.tcUSD || 0, asOf },
    allocationTargets: [],
    asOf,
    dataCoverage: {
      source: options.sourceLabel,
      loadedAt,
      balanceAsOf: corteBalance,
      cashflowAsOf: source.supuestos.fechaCorteFlujo,
      gaps,
      excelTotals: {
        totalActivos: source.balance.totalActivos ?? 0,
        totalPasivos: source.balance.totalPasivos ?? 0,
        patrimonioNeto: source.balance.patrimonioNeto ?? 0,
      },
      reconciliation,
    },
  };
}
