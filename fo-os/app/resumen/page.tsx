import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { AllocationDonut } from "@/components/graficos/AllocationDonut";
import { CashFlowChart } from "@/components/graficos/CashFlowChart";
import { ExposureBar } from "@/components/graficos/ExposureBar";
import { PortfolioChart } from "@/components/graficos/PortfolioChart";
import { CapitalRequirementCard } from "@/components/dashboard/CapitalRequirementCard";
import { InvestmentFirepowerCard } from "@/components/dashboard/InvestmentFirepowerCard";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { PortfolioAlertCard } from "@/components/dashboard/PortfolioAlertCard";
import { ResumenFilters } from "@/components/dashboard/FilterBar";
import { PageHeader, SectionTitle } from "@/components/navegacion/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/data";
import {
  ASSET_CLASS_LABELS,
  calculateCashFlow,
  calculateCurrencyExposure,
  calculateEconomicExposure,
  calculateGeographicExposure,
  calculateInvestmentFirepower,
  calculateLiquidity,
  calculateNetWorth,
  calculatePortfolioAlerts,
  calculateTopExposures,
  netWorthSeries,
  returnsByClass,
  trailingMonths,
} from "@/lib/calculos";
import { formatCLP, formatOr, formatPct } from "@/lib/formatters";

export const metadata = { title: "Resumen General · Family Office OS" };

export default function ResumenPage() {
  const nw = calculateNetWorth(db);
  const liq = calculateLiquidity(db);
  const fp = calculateInvestmentFirepower(db);
  const series = netWorthSeries(db);
  const current = series[series.length - 1];
  const exposure = calculateEconomicExposure(db);
  const { from, to } = trailingMonths(db.asOf, 12);
  const ltm = calculateCashFlow(db, from, to, true);
  const alerts = calculatePortfolioAlerts(db);
  const top = calculateTopExposures(db, 5);
  const returns = returnsByClass(db);
  // Sin cierre anterior no hay variación: se muestra "s/d" en vez de un 0,0% que parecería
  // un año plano. Lo mismo con el flujo, cuando la fuente solo trae proyección.
  const ytdReturn = current.changePct ?? null;
  const hasHistory = ltm.months.some((m) => m.income !== 0 || m.expenses !== 0);

  const holdings = db.entities
    .filter((e) => e.entityType === "HOLDING")
    .map((e) => ({ value: e.id, label: e.name.replace(" SpA", "") }));

  return (
    <>
      <PageHeader
        eyebrow="Family Office"
        title="Resumen Patrimonial"
        subtitle="¿Cómo está nuestro patrimonio? Todas las cifras derivan de las mismas entidades, activos y movimientos."
        actions={<ResumenFilters holdings={holdings} />}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <MetricCard label="Activos Totales" value={formatCLP(nw.totalAssets)} hint="Base económica look-through" />
        <MetricCard label="Deuda Total" value={formatCLP(nw.totalDebt)} hint={`${formatPct(nw.totalDebt / nw.totalAssets)} de los activos`} />
        <MetricCard label="Patrimonio Neto" value={formatCLP(nw.netWorth)} delta={current.changePct} hint="vs. cierre anterior" />
        <MetricCard label="Liquidez Disponible" value={formatCLP(liq.grossLiquidity)} hint="Caja + líquidos + líneas" />
        <MetricCard
          label="Flujo Últimos 12 Meses"
          value={hasHistory ? formatCLP(ltm.net) : "s/d"}
          hint={hasHistory ? `Ingresos ${formatCLP(ltm.income)}` : "Sin meses cerrados en la fuente"}
        />
        <MetricCard
          label="Retorno YTD"
          value={formatOr(ytdReturn, (v) => formatPct(v, { sign: true }))}
          hint={ytdReturn === null ? "Sin cierre anterior con que comparar" : "Patrimonio neto"}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Evolución del Patrimonio Neto</CardTitle>
              <p className="mt-1 text-[13px] text-muted">
                {series.length > 1 ? "Últimos 5 años y año en curso" : "Un solo corte en la fuente: aún no hay serie histórica"}
              </p>
            </div>
            <div className="text-right">
              <p className="tnum text-[15px] font-semibold text-foreground">{formatCLP(current.netWorth)}</p>
              <p className="tnum text-[12px] text-positive">
                {ytdReturn === null ? "s/d en el año" : `${formatPct(ytdReturn, { sign: true })} en el año`}
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <PortfolioChart data={series} />
          </CardContent>
        </Card>

        <InvestmentFirepowerCard fp={fp} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Distribución de Activos</CardTitle>
            <Link href="/asignacion" className="flex items-center gap-1 text-[12px] text-muted hover:text-foreground">
              Ver asignación <ArrowUpRight className="size-3" />
            </Link>
          </CardHeader>
          <CardContent>
            <AllocationDonut data={exposure.map((e) => ({ label: e.label, value: e.value, share: e.share }))} />
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <Card>
            <CardHeader>
              <CardTitle>Exposición por Moneda</CardTitle>
            </CardHeader>
            <CardContent>
              <ExposureBar items={calculateCurrencyExposure(db).map((e) => ({ label: e.label, value: e.value, share: e.share }))} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Exposición Geográfica</CardTitle>
            </CardHeader>
            <CardContent>
              <ExposureBar items={calculateGeographicExposure(db).map((e) => ({ label: e.label, value: e.value, share: e.share }))} />
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Flujo de Caja del Family Office</CardTitle>
              <p className="mt-1 text-[13px] text-muted">Últimos 12 meses</p>
            </div>
            <Link href="/flujo-de-caja" className="flex items-center gap-1 text-[12px] text-muted hover:text-foreground">
              Ver detalle <ArrowUpRight className="size-3" />
            </Link>
          </CardHeader>
          <CardContent>
            <div className="mb-4 grid grid-cols-3 gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted">Ingresos</p>
                <p className="tnum text-[16px] font-semibold text-foreground">{formatCLP(ltm.income)}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted">Egresos</p>
                <p className="tnum text-[16px] font-semibold text-foreground">{formatCLP(ltm.expenses)}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted">Flujo Neto</p>
                <p className="tnum text-[16px] font-semibold text-positive">{formatCLP(ltm.net, { sign: true })}</p>
              </div>
            </div>
            <CashFlowChart data={ltm.months} height={220} />
          </CardContent>
        </Card>

        <PortfolioAlertCard alerts={alerts} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Principales Exposiciones</CardTitle>
            <Link href="/inversiones" className="flex items-center gap-1 text-[12px] text-muted hover:text-foreground">
              Ver todas <ArrowUpRight className="size-3" />
            </Link>
          </CardHeader>
          <CardContent className="pt-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Activo / Inversión</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Valor Económico</TableHead>
                  <TableHead className="text-right">% del Patrimonio</TableHead>
                  <TableHead className="text-right">Retorno Acum.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {top.map((t) => {
                  const ret =
                    t.asset.acquisitionCost !== undefined && t.asset.acquisitionCost > 0
                      ? t.asset.currentValue / t.asset.acquisitionCost - 1
                      : null;
                  return (
                    <TableRow key={t.asset.id}>
                      <TableCell className="font-medium">{t.asset.name}</TableCell>
                      <TableCell className="text-muted">{ASSET_CLASS_LABELS[t.asset.assetClass]}</TableCell>
                      <TableCell className="text-right">{formatCLP(t.economicValue)}</TableCell>
                      <TableCell className="text-right">{formatPct(t.shareOfNetWorth)}</TableCell>
                      <TableCell className={`text-right ${(ret ?? 0) >= 0 ? "text-positive" : "text-negative"}`}>
                        {formatOr(ret, (v) => formatPct(v, { sign: true }))}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <CapitalRequirementCard commitments={db.commitments} entities={db.entities} />
      </div>

      <div className="mt-4">
        <SectionTitle hint="Ganancia no realizada sobre costo, en base económica">Rendimiento por clase de activo</SectionTitle>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {returns.map((r) => (
            <Card key={r.assetClass}>
              <CardContent className="px-5 py-4">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted">{ASSET_CLASS_LABELS[r.assetClass]}</p>
                <p className={`tnum mt-1.5 text-[20px] font-semibold leading-none ${(r.simpleReturn ?? 0) >= 0 ? "text-foreground" : "text-negative"}`}>
                  {formatOr(r.simpleReturn, (v) => formatPct(v, { sign: true }))}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <Badge variant="outline">{formatCLP(r.currentValue)}</Badge>
                  {r.cashYieldLTM > 0 ? <span className="text-[12px] text-muted">Yield {formatPct(r.cashYieldLTM)}</span> : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </>
  );
}
