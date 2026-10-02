/**
 * Prueba de robustez del lector de Google Sheets: ediciones normales de una planilla viva no
 * deben perder datos en silencio. Cada caso parte de la planilla real simulada y la modifica
 * como lo haría una persona.
 *
 *   npm run check-sheets
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SheetsFormatError, norm } from "../lib/sheets/cells";
import { parseSource, type SheetsPayload } from "../lib/sheets/source";
import { transform } from "../lib/sheets/transform";

const fixturePath = join(__dirname, "..", ".sheets-fixture", "payload.json");
if (!existsSync(fixturePath)) {
  console.error("Falta .sheets-fixture/payload.json. Genéralo con: python3 scripts/export_sheet_fixture.py");
  process.exit(2);
}
const base = JSON.parse(readFileSync(fixturePath, "utf8")) as SheetsPayload;
const clone = (): SheetsPayload => structuredClone(base);

const run = (p: SheetsPayload) => transform(parseSource(p), { generatedAt: p.generatedAt, sourceLabel: "test", rentMappingFallback: [] });
const baseline = run(clone());

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "  ok " : " FALLA"}  ${name}${detail ? " — " + detail : ""}`);
  if (!ok) failed++;
}

const headerRow = (g: unknown[][], first: string) => g.findIndex((r) => norm(r[0]) === first || norm(r[1]) === first);
const totalRow = (g: unknown[][]) => g.findIndex((r) => r.some((c) => norm(c) === "total"));

// 1. Propiedad nueva insertada ARRIBA del TOTAL, fuera del rango fijo que usaba Python (filas 5–38).
{
  const p = clone();
  const g = p.sheets["Bienes_Raices"];
  const t = totalRow(g);
  const row = g[4].map(() => "") as unknown[];
  row[1] = "Departamento";
  row[2] = "Calle Nueva 123";
  row[3] = "Providencia";
  row[6] = "Praga";
  row[7] = 100_000_000;
  g.splice(t, 0, row as never);
  const db = run(p);
  const found = db.assets.find((a) => a.name === "Calle Nueva 123");
  check("propiedad insertada sobre el TOTAL se lee", !!found, found ? `valor ${found.currentValue.toLocaleString("es-CL")} (avalúo × factor)` : "");
  check("el patrimonio sube por esa propiedad", db.assets.length === baseline.assets.length + 1);
}

// 2. Datos escritos DEBAJO del TOTAL: no se leen, pero deben avisar.
{
  const p = clone();
  const g = p.sheets["Bienes_Raices"];
  const row = g[4].map(() => "") as unknown[];
  row[2] = "Propiedad bajo el total";
  row[8] = 500_000_000;
  g.push(row as never);
  const db = run(p);
  const warned = db.dataCoverage?.gaps.some((x) => x.module === "Calidad de datos" && x.detail.includes("Propiedad bajo el total"));
  check("filas bajo el TOTAL se avisan y no se pierden en silencio", !!warned && !db.assets.some((a) => a.name === "Propiedad bajo el total"));
}

// 3. Columna nueva insertada en medio de la tabla: las posiciones cambian, los encabezados no.
{
  const p = clone();
  for (const row of p.sheets["Bienes_Raices"]) row.splice(3, 0, "");
  p.sheets["Bienes_Raices"][headerRow(p.sheets["Bienes_Raices"], "tipo")][3] = "Comentario";
  const db = run(p);
  const same = db.assets.filter((a) => a.assetClass === "INMOBILIARIO").length === baseline.assets.filter((a) => a.assetClass === "INMOBILIARIO").length;
  const sumA = db.assets.reduce((a, x) => a + x.currentValue * x.ownershipPercentage, 0);
  const sumB = baseline.assets.reduce((a, x) => a + x.currentValue * x.ownershipPercentage, 0);
  check("columna insertada en medio no altera los valores", same && Math.abs(sumA - sumB) < 1, `activos ${Math.round(sumA).toLocaleString("es-CL")}`);
}

// 4. Fila de empresas nueva insertada sobre el TOTAL.
{
  const p = clone();
  const g = p.sheets["Empresas"];
  const t = g.findIndex((r) => norm(r[0]).startsWith("total"));
  g.splice(t, 0, ["Empresa Nueva SPA", "76.000.000-0", 0.5, 200_000_000, 100_000_000, ""] as never);
  const db = run(p);
  const e = db.assets.find((a) => a.name === "Empresa Nueva SPA");
  check("empresa nueva sobre el TOTAL se lee", !!e && e.currentValue === 200_000_000 && e.ownershipPercentage === 0.5);
}

// 5. Cuenta nueva en Liquidez, antes del SUBTOTAL.
{
  const p = clone();
  const g = p.sheets["Liquidez"];
  const t = g.findIndex((r) => norm(r[0]).startsWith("subtotal"));
  g.splice(t, 0, ["Cuenta Nueva Banco X", "Cristián Armas Morel", "Familia", 12_345_678, ""] as never);
  const db = run(p);
  check("cuenta nueva en Liquidez se lee", db.assets.some((a) => a.name === "Cuenta Nueva Banco X" && a.currentValue === 12_345_678));
}

// 6. Pestaña faltante: error claro, no un dashboard vacío.
{
  const p = clone();
  delete p.sheets["Pasivos"];
  let msg = "";
  try {
    run(p);
  } catch (e) {
    msg = e instanceof SheetsFormatError ? e.message : `inesperado: ${e}`;
  }
  check("pestaña faltante da un error que dice cuál", msg.includes('"Pasivos"'), msg);
}

// 7. Encabezado renombrado: error claro.
{
  const p = clone();
  const g = p.sheets["Bienes_Raices"];
  const h = headerRow(g, "tipo");
  g[h] = g[h].map((c) => (norm(c).startsWith("avaluo") ? "Valor SII" : c));
  let msg = "";
  try {
    run(p);
  } catch (e) {
    msg = e instanceof SheetsFormatError ? e.message : `inesperado: ${e}`;
  }
  check("encabezado renombrado da un error que lo nombra", msg.includes("Bienes_Raices"), msg);
}

// 8. Fecha de corte con otro formato (ISO) y meses del flujo como fechas (Sheets los convierte).
{
  const p = clone();
  const s = p.sheets["Supuestos"];
  const i = s.findIndex((r) => norm(r[0]).startsWith("fecha de corte — balance") || norm(r[0]).startsWith("fecha de corte - balance"));
  s[i][1] = "2026-07-17";
  const f = p.sheets["Flujo_Caja"];
  const h = f.findIndex((r) => norm(r[0]) === "concepto");
  f[h] = f[h].map((c, k) => (k >= 1 && typeof c === "string" && /^ago-26$/.test(c) ? "2026-08-01" : c));
  const db = run(p);
  check("fecha ISO y mes como fecha se entienden", db.asOf === "2026-07-17" && db.transactions.length === baseline.transactions.length);
}

console.log(failed === 0 ? "\nROBUSTEZ: OK" : `\nROBUSTEZ: ${failed} caso(s) fallaron`);
process.exit(failed === 0 ? 0 : 1);
