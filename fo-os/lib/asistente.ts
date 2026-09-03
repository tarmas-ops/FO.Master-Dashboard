/**
 * Asistente de preguntas en lenguaje natural (mock).
 * Las respuestas se derivan de la base de datos con el motor financiero — no son
 * textos fijos — para que al conectar un LLM real el contrato de datos ya exista.
 */
import { db } from "@/data";
import {
  allPerformanceVsPlan,
  calculateCashFlow,
  calculateCurrencyExposure,
  calculateEconomicExposure,
  calculateInvestmentFirepower,
  calculateNetWorth,
  calculateTopExposures,
  familyOwnershipOfEntity,
  realEstatePortfolio,
} from "@/lib/calculos";
import { formatCLP, formatPct } from "@/lib/formatters";

export const EXAMPLE_QUESTIONS = [
  "¿Cuál es nuestra exposición inmobiliaria?",
  "¿Cuánto capital podemos invertir?",
  "¿Qué activos tienen LTV superior al 60%?",
  "¿Cuánto flujo generó el portafolio en 2025?",
  "¿Qué inversiones tienen IRR menor a 10%?",
  "¿Qué activos están bajo el caso base?",
  "¿Cuánto debemos pagar en capital calls los próximos 6 meses?",
  "¿Cuál es nuestra exposición real a USD?",
  "¿Qué inversiones representan más del 10% del patrimonio?",
];

function normalize(q: string): string {
  return q
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function pctFromQuestion(q: string, fallback: number): number {
  const m = q.match(/(\d+(?:[.,]\d+)?)\s*%/);
  return m ? Number(m[1].replace(",", ".")) / 100 : fallback;
}

export function answerQuestion(question: string): string {
  const q = normalize(question);
  const nw = calculateNetWorth(db);

  if (q.includes("inmobiliari")) {
    const re = realEstatePortfolio(db);
    const row = calculateEconomicExposure(db).find((e) => e.key === "INMOBILIARIO");
    return `La exposición económica inmobiliaria es ${formatCLP(row?.value ?? 0)} (${formatPct(row?.share ?? 0)} de los activos), en ${re.rows.length} activos. Deuda asociada ${formatCLP(re.economicDebt)}, LTV promedio ${formatPct(re.weightedLTV)}, NOI total ${formatCLP(re.totalNOI)} y cap rate ${formatPct(re.weightedCapRate)}.`;
  }

  if (q.includes("capital") && (q.includes("invertir") || q.includes("desplegar") || q.includes("capacidad"))) {
    const fp = calculateInvestmentFirepower(db);
    return `Capacidad total de inversión: ${formatCLP(fp.totalCapacity)}.\nCapital desplegable ${formatCLP(fp.deployableCapital)} (liquidez bruta ${formatCLP(fp.grossLiquidity)} menos reserva mínima ${formatCLP(fp.minimumReserve)}, capital calls ${formatCLP(fp.upcomingCapitalCalls)} y CAPEX comprometido ${formatCLP(fp.committedCapex)}) más capacidad adicional de deuda ${formatCLP(fp.additionalDebtCapacity)} hasta un LTV de política de ${formatPct(fp.policyLTV, { decimals: 0 })}.`;
  }

  if (q.includes("ltv")) {
    const threshold = pctFromQuestion(q, 0.6);
    const rows = realEstatePortfolio(db).rows.filter((r) => r.ltv > threshold);
    if (rows.length === 0) return `Ningún activo tiene LTV superior a ${formatPct(threshold, { decimals: 0 })}.`;
    return `${rows.length} activo(s) con LTV superior a ${formatPct(threshold, { decimals: 0 })}:\n${rows.map((r) => `• ${r.asset.name}: ${formatPct(r.ltv)} (deuda ${formatCLP(r.debt)} sobre ${formatCLP(r.value)})`).join("\n")}`;
  }

  if (q.includes("flujo") && /20\d\d/.test(q)) {
    const year = q.match(/20\d\d/)?.[0] ?? "2025";
    const cf = calculateCashFlow(db, `${year}-01`, `${year}-12`, true);
    return `En ${year} el portafolio generó ingresos por ${formatCLP(cf.income)} y egresos por ${formatCLP(cf.expenses)}: flujo neto ${formatCLP(cf.net, { sign: true })}. Principales ingresos: arriendos ${formatCLP(cf.byCategory.ARRIENDOS)}, dividendos ${formatCLP(cf.byCategory.DIVIDENDOS)}, distribuciones ${formatCLP(cf.byCategory.DISTRIBUCIONES)}.`;
  }

  if (q.includes("irr") || q.includes("tir")) {
    const threshold = pctFromQuestion(q, 0.1);
    const rows = allPerformanceVsPlan(db).filter((p) => p.actualIRR !== null && (p.actualIRR ?? 0) < threshold);
    if (rows.length === 0) return `Ninguna inversión tiene IRR real bajo ${formatPct(threshold, { decimals: 0 })}.`;
    return `${rows.length} inversión(es) con IRR real bajo ${formatPct(threshold, { decimals: 0 })}:\n${rows.map((p) => `• ${p.asset.name}: ${formatPct(p.actualIRR ?? 0)} vs. caso base ${formatPct(p.baseCaseIRR)}`).join("\n")}`;
  }

  if (q.includes("bajo el caso") || q.includes("bajo plan") || q.includes("tesis")) {
    const rows = allPerformanceVsPlan(db).filter((p) => p.status === "BAJO_PLAN" || p.status === "REVISION_REQUERIDA");
    if (rows.length === 0) return "Todas las inversiones con tesis registrada están en línea o sobre el caso base.";
    return `${rows.length} inversión(es) bajo el caso base o en revisión:\n${rows.map((p) => `• ${p.asset.name}: ${p.status === "BAJO_PLAN" ? "bajo plan" : "revisión requerida"} — IRR ${p.actualIRR === null ? "s/d" : formatPct(p.actualIRR)} vs. ${formatPct(p.baseCaseIRR)} esperado`).join("\n")}`;
  }

  if (q.includes("capital call")) {
    const months = Number(q.match(/(\d+)\s*mes/)?.[1] ?? 6);
    const end = new Date(db.asOf);
    end.setMonth(end.getMonth() + months);
    const calls = db.capitalCalls.filter((c) => c.status === "PENDIENTE" && new Date(c.dueDate) <= end);
    const total = calls.reduce((a, c) => a + c.amount * familyOwnershipOfEntity(db, c.entityId), 0);
    if (calls.length === 0) return `No hay capital calls pendientes en los próximos ${months} meses.`;
    return `Capital calls en los próximos ${months} meses: ${formatCLP(total)} en ${calls.length} llamado(s):\n${calls.map((c) => `• ${c.dueDate}: ${db.assets.find((a) => a.id === c.fundId)?.name ?? c.fundId} — ${formatCLP(c.amount)}`).join("\n")}`;
  }

  if (q.includes("usd") || q.includes("dolar")) {
    const row = calculateCurrencyExposure(db).find((e) => e.key === "USD");
    return `La exposición económica real a USD es ${formatCLP(row?.value ?? 0)} (${formatPct(row?.share ?? 0)} de los activos), considerando la participación look-through en cada activo denominado en dólares.`;
  }

  if (q.includes("mas del") || q.includes("mas de") || q.includes("representan")) {
    const threshold = pctFromQuestion(q, 0.1);
    const rows = calculateTopExposures(db, 20).filter((t) => t.shareOfNetWorth > threshold);
    if (rows.length === 0) return `Ninguna inversión representa más del ${formatPct(threshold, { decimals: 0 })} del patrimonio neto.`;
    return `${rows.length} inversión(es) sobre el ${formatPct(threshold, { decimals: 0 })} del patrimonio neto:\n${rows.map((t) => `• ${t.asset.name}: ${formatPct(t.shareOfNetWorth)} (${formatCLP(t.economicValue)})`).join("\n")}`;
  }

  if (q.includes("patrimonio") || q.includes("deuda") || q.includes("activos")) {
    return `Activos totales ${formatCLP(nw.totalAssets)}, deuda total ${formatCLP(nw.totalDebt)} y patrimonio neto ${formatCLP(nw.netWorth)} (base económica look-through).`;
  }

  return `Aún no puedo responder eso. Patrimonio neto actual: ${formatCLP(nw.netWorth)}. Prueba con una de las preguntas sugeridas.`;
}
