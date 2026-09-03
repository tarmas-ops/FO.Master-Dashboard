/**
 * Conciliación de la base mock: imprime las cifras maestras y las inconsistencias.
 * Uso: npm run reconcile
 */
import { db } from "../data";
import {
  calculateCurrencyExposure,
  calculateEconomicExposure,
  calculateGeographicExposure,
  calculateInvestmentFirepower,
  calculateLiquidityCoverage,
  calculateNetWorth,
  calculatePortfolioAlerts,
  calculateCashFlow,
  netWorthSeries,
  realEstatePortfolio,
  trailingMonths,
  validatePortfolioConsistency,
} from "../lib/calculos";
import { formatCLP, formatMultiple, formatOr, formatPct } from "../lib/formatters";

const nw = calculateNetWorth(db);
console.log("PATRIMONIO");
console.log("  Activos totales  ", formatCLP(nw.totalAssets));
console.log("  Deuda total      ", formatCLP(nw.totalDebt));
console.log("  Patrimonio neto  ", formatCLP(nw.netWorth));

console.log("\nASIGNACIÓN (look-through)");
for (const e of calculateEconomicExposure(db)) console.log(`  ${e.label.padEnd(20)} ${formatCLP(e.value).padStart(12)}  ${formatPct(e.share)}`);
console.log("\nMONEDA");
for (const e of calculateCurrencyExposure(db)) console.log(`  ${e.label.padEnd(20)} ${formatCLP(e.value).padStart(12)}  ${formatPct(e.share)}`);
console.log("\nGEOGRAFÍA");
for (const e of calculateGeographicExposure(db)) console.log(`  ${e.label.padEnd(20)} ${formatCLP(e.value).padStart(12)}  ${formatPct(e.share)}`);

const re = realEstatePortfolio(db);
console.log("\nINMOBILIARIO (100%)");
console.log("  Valor", formatCLP(re.totalValue), "Deuda", formatCLP(re.totalDebt), "NOI", formatOr(re.totalNOI, formatCLP), "Cap", formatOr(re.weightedCapRate, formatPct), "LTV", formatPct(re.weightedLTV), "Ocup", formatOr(re.weightedOccupancy, formatPct));
for (const r of re.rows) {
  console.log(`  ${r.asset.name.padEnd(28)} LTV ${formatPct(r.ltv).padStart(6)}  DSCR ${r.dscr === null ? "—" : formatMultiple(r.dscr)}  Cap ${formatOr(r.capRate, formatPct)}  CoC ${formatOr(r.cashOnCash, formatPct)}`);
}

const fp = calculateInvestmentFirepower(db);
console.log("\nCAPACIDAD DE INVERSIÓN");
console.log("  Caja                       ", formatCLP(fp.cash));
console.log("  Activos líquidos           ", formatCLP(fp.liquidAssets));
console.log("  Líneas disponibles         ", formatCLP(fp.availableCreditLines));
console.log("  Liquidez bruta             ", formatCLP(fp.grossLiquidity));
console.log("  − Reserva mínima           ", formatCLP(fp.minimumReserve));
console.log("  − Capital calls 12m        ", formatCLP(fp.upcomingCapitalCalls));
console.log("  − CAPEX comprometido 12m   ", formatCLP(fp.committedCapex));
console.log("  Capital desplegable        ", formatCLP(fp.deployableCapital));
console.log("  Capacidad adicional deuda  ", formatCLP(fp.additionalDebtCapacity));
console.log("  CAPACIDAD TOTAL            ", formatCLP(fp.totalCapacity));

const { from, to } = trailingMonths(db.asOf, 12);
const ltm = calculateCashFlow(db, from, to, true);
console.log(`\nFLUJO LTM (${from} → ${to})`);
console.log("  Ingresos", formatCLP(ltm.income), " Egresos", formatCLP(ltm.expenses), " Neto", formatCLP(ltm.net));
for (const [k, v] of Object.entries(ltm.byCategory)) if (v !== 0) console.log(`    ${k.padEnd(22)} ${formatCLP(v)}`);

console.log("\nCOBERTURA DE LIQUIDEZ");
for (const h of [3, 6, 12, 24]) {
  const c = calculateLiquidityCoverage(db, h);
  console.log(`  ${String(h).padStart(2)} meses: usos ${formatCLP(c.uses).padStart(10)}  cobertura ${c.coverage === null ? "—" : formatMultiple(c.coverage, 1)}`);
}

console.log("\nEVOLUCIÓN PATRIMONIO");
for (const p of netWorthSeries(db)) console.log(`  ${p.year}  ${formatCLP(p.netWorth).padStart(12)}  ${p.changePct === null ? "" : formatPct(p.changePct, { sign: true })}`);

console.log("\nALERTAS");
for (const a of calculatePortfolioAlerts(db)) console.log(`  [${a.severity}] ${a.title} — ${a.detail}`);

const issues = validatePortfolioConsistency(db);
console.log(`\nCONCILIACIÓN: ${issues.length === 0 ? "OK — sin inconsistencias" : `${issues.length} problema(s)`}`);
for (const i of issues) console.log(`  ${i.level.toUpperCase()} ${i.check}: ${i.detail}`);
if (issues.some((i) => i.level === "error")) process.exit(1);
