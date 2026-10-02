import { MetricCard } from "@/components/dashboard/MetricCard";
import { PortfolioAlertCard } from "@/components/dashboard/PortfolioAlertCard";
import { ExposureBar } from "@/components/graficos/ExposureBar";
import { PageHeader, SectionTitle } from "@/components/navegacion/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/data";
import {
  ALERT_THRESHOLDS,
  ASSET_CLASS_LABELS,
  calculateCurrencyExposure,
  calculateEconomicExposure,
  calculateGeographicExposure,
  calculateLiquidityCoverage,
  calculateNetWorth,
  calculatePortfolioAlerts,
  calculateSectorExposure,
  calculateTopExposures,
} from "@/lib/calculos";
import { formatCLP, formatMultiple, formatPct } from "@/lib/formatters";

export const metadata = { title: "Riesgo · Family Office OS" };

export default function RiesgoPage() {
  const nw = calculateNetWorth(db);
  const top = calculateTopExposures(db, 10);
  const exposure = calculateEconomicExposure(db);
  const alerts = calculatePortfolioAlerts(db);
  const coverage12 = calculateLiquidityCoverage(db, 12);
  const largestAsset = top[0];
  const largestCompany = top.find((t) => t.asset.assetClass === "EMPRESAS_PRIVADAS");
  const inmobiliario = exposure.find((e) => e.key === "INMOBILIARIO");
  const chile = calculateGeographicExposure(db).find((e) => e.key === "CL");

  // Cada categoría tiene tres estados, no dos: un semáforo verde afirma "evaluado y bien".
  // Cuando la fuente no trae lo necesario para evaluar, el estado es "sin dato", no verde.
  const usdShare = calculateCurrencyExposure(db).find((e) => e.key === "USD")?.share ?? 0;
  const fxInformed = db.fx.USD > 0 || db.assets.some((a) => a.currency !== "CLP");
  const delinquentLoans = db.loans.filter((l) => l.delinquent);
  const datedLoans = db.loans.filter((l) => !l.delinquent && l.maturityDate);
  const yearsOut = (n: number) => new Date(new Date(db.asOf).setFullYear(new Date(db.asOf).getFullYear() + n));
  const within = (l: (typeof db.loans)[number], n: number) => new Date(l.maturityDate as string) <= yearsOut(n);
  // La cobertura de liquidez se calcula contra compromisos (capital calls, vencimientos, capex,
  // impuestos). Sin ellos no hay "usos" que cubrir y la métrica no se puede evaluar.
  const hasCommitments = db.commitments.length > 0;
  const hasTenants = db.assets.some((a) => a.assetClass === "INMOBILIARIO" && a.tenants.length > 0);

  type RiskStatus = "ok" | "breach" | "nodata";
  const riskCategories: Array<{ name: string; detail: string; status: RiskStatus }> = [
    {
      name: "Riesgo de Concentración",
      detail: `La mayor posición individual representa ${formatPct(largestAsset?.shareOfAssets ?? 0)} de los activos y el inmobiliario ${formatPct(inmobiliario?.share ?? 0)}.`,
      status: (largestAsset?.shareOfAssets ?? 0) > ALERT_THRESHOLDS.maxSingleAssetShare ? "breach" : "ok",
    },
    {
      name: "Riesgo de Liquidez",
      detail: hasCommitments
        ? `Cobertura de compromisos a 12 meses de ${coverage12.coverage === null ? "—" : formatMultiple(coverage12.coverage, 1)} sobre usos por ${formatCLP(coverage12.uses)}.`
        : "No hay compromisos de capital (capital calls, vencimientos, CAPEX, impuestos) cargados, así que no se puede medir la cobertura de usos.",
      status: !hasCommitments ? "nodata" : coverage12.coverage !== null && coverage12.coverage < 1.5 ? "breach" : "ok",
    },
    {
      name: "Riesgo de Refinanciamiento",
      detail:
        delinquentLoans.length > 0
          ? `${delinquentLoans.length} deuda(s) en mora, sin fecha de vencimiento informada. ${datedLoans.filter((l) => within(l, 2)).length} crédito(s) con vencimiento dentro de 24 meses.`
          : `${datedLoans.filter((l) => within(l, 2)).length} crédito(s) vencen dentro de 24 meses.`,
      status: delinquentLoans.length > 0 || datedLoans.some((l) => within(l, 1)) ? "breach" : db.loans.length === 0 ? "nodata" : "ok",
    },
    {
      name: "Riesgo Cambiario",
      detail: fxInformed
        ? `Exposición en USD de ${formatPct(usdShare)} de los activos.`
        : "La fuente registra todos los activos en CLP y no informa tipo de cambio USD, así que no distingue la exposición cambiaria real.",
      status: !fxInformed ? "nodata" : usdShare > 0.3 ? "breach" : "ok",
    },
    {
      name: "Riesgo de Contraparte",
      detail: hasTenants
        ? "Calculado sobre la renta de los arrendatarios registrados."
        : "No hay arrendatarios ni gestores de fondos cargados, así que no se puede medir la dependencia de una sola contraparte.",
      status: hasTenants ? "ok" : "nodata",
    },
  ];

  return (
    <>
      <PageHeader eyebrow="Análisis" title="Riesgo" subtitle="¿Qué puede salir mal? Indicadores de concentración, liquidez y estructura financiera." />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <MetricCard
          label="Mayor Activo"
          value={formatPct(largestAsset?.shareOfAssets ?? 0)}
          hint={largestAsset?.asset.name}
          tooltip={`Máximo recomendado ${formatPct(ALERT_THRESHOLDS.maxSingleAssetShare, { decimals: 0 })} del patrimonio en un solo activo.`}
        />
        <MetricCard label="Mayor Empresa" value={formatPct(largestCompany?.shareOfAssets ?? 0)} hint={largestCompany?.asset.name} />
        <MetricCard label="Exposición Inmobiliaria" value={formatPct(inmobiliario?.share ?? 0)} hint={formatCLP(inmobiliario?.value ?? 0)} />
        <MetricCard label="Exposición Chile" value={formatPct(chile?.share ?? 0)} hint={formatCLP(chile?.value ?? 0)} />
        <MetricCard label="Deuda / Patrimonio Neto" value={formatPct(nw.totalDebt / nw.netWorth)} />
        <MetricCard
          label="Cobertura de Liquidez"
          value={coverage12.coverage === null ? "—" : formatMultiple(coverage12.coverage, 1)}
          hint="12 meses"
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Top 10 Exposiciones</CardTitle>
            <span className="text-[12px] text-muted">Excluye caja</span>
          </CardHeader>
          <CardContent className="pt-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Activo</TableHead>
                  <TableHead>Clase</TableHead>
                  <TableHead className="text-right">Valor Económico</TableHead>
                  <TableHead className="text-right">% Activos</TableHead>
                  <TableHead className="text-right">% Patrimonio</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {top.map((t) => (
                  <TableRow key={t.asset.id}>
                    <TableCell className="font-medium">{t.asset.name}</TableCell>
                    <TableCell className="text-muted">{ASSET_CLASS_LABELS[t.asset.assetClass]}</TableCell>
                    <TableCell className="text-right">{formatCLP(t.economicValue)}</TableCell>
                    <TableCell className={`text-right ${t.shareOfAssets > ALERT_THRESHOLDS.maxSingleAssetShare ? "text-negative" : ""}`}>
                      {formatPct(t.shareOfAssets)}
                    </TableCell>
                    <TableCell className="text-right">{formatPct(t.shareOfNetWorth)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <PortfolioAlertCard alerts={alerts} limit={6} />
      </div>

      <div className="mt-6">
        <SectionTitle>Categorías de riesgo</SectionTitle>
        <Card>
          <CardContent className="px-0 py-0">
            <ul className="divide-y divide-border">
              {riskCategories.map((r) => (
                <li key={r.name} className="flex items-start gap-3 px-5 py-3.5">
                  <span
                    className={`mt-1.5 size-2 shrink-0 rounded-full ${
                      r.status === "breach" ? "bg-negative" : r.status === "ok" ? "bg-positive" : "bg-muted-2"
                    }`}
                  />
                  <div>
                    <p className="text-[13px] font-medium text-foreground">
                      {r.name}
                      {r.status === "nodata" ? <span className="ml-2 text-[11px] font-normal text-muted-2">sin dato</span> : null}
                    </p>
                    <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{r.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Concentración por Clase</CardTitle>
          </CardHeader>
          <CardContent>
            <ExposureBar items={exposure.map((e) => ({ label: e.label, value: e.value, share: e.share }))} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Concentración por Sector</CardTitle>
          </CardHeader>
          <CardContent>
            <ExposureBar items={calculateSectorExposure(db).map((e) => ({ label: e.label, value: e.value, share: e.share }))} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Concentración por Moneda</CardTitle>
          </CardHeader>
          <CardContent>
            <ExposureBar items={calculateCurrencyExposure(db).map((e) => ({ label: e.label, value: e.value, share: e.share }))} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
