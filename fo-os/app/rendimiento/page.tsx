import { MetricCard } from "@/components/dashboard/MetricCard";
import { PortfolioChart } from "@/components/graficos/PortfolioChart";
import { PageHeader, SectionTitle } from "@/components/navegacion/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/data";
import {
  ASSET_CLASS_LABELS,
  netWorthBridge,
  netWorthReturn,
  netWorthSeries,
  PERIOD_LABELS,
  privateMarketsSummary,
  realEstatePortfolio,
  returnsByClass,
  type Period,
} from "@/lib/calculos";
import { formatCLP, formatMultiple, formatPct } from "@/lib/formatters";

export const metadata = { title: "Rendimiento · Family Office OS" };

const PERIODS: Period[] = ["YTD", "1A", "3A", "5A", "INICIO"];

export default function RendimientoPage() {
  const series = netWorthSeries(db);
  const returns = returnsByClass(db);
  const bridge = netWorthBridge(db);
  const pm = privateMarketsSummary(db);
  const re = realEstatePortfolio(db);
  const ytd = netWorthReturn(db, "YTD");

  return (
    <>
      <PageHeader
        eyebrow="Análisis"
        title="Rendimiento"
        subtitle="¿Estamos creando valor? Retornos derivados de la valorización de cada activo y del flujo efectivamente recibido."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {PERIODS.map((p) => {
          const r = netWorthReturn(db, p);
          return (
            <MetricCard
              key={p}
              label={PERIOD_LABELS[p]}
              value={r === null ? "—" : formatPct(r.value, { sign: true })}
              hint={r === null ? undefined : `anualizado ${formatPct(r.annualized)}`}
            />
          );
        })}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Evolución del Patrimonio Neto</CardTitle>
              <p className="mt-1 text-[13px] text-muted">Retorno acumulado desde 2021</p>
            </div>
            <span className="tnum text-[15px] font-semibold text-positive">{ytd ? formatPct(ytd.value, { sign: true }) : "—"}</span>
          </CardHeader>
          <CardContent>
            <PortfolioChart data={series} height={280} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Bridge de Patrimonio</CardTitle>
            <span className="text-[12px] text-muted">Últimos 12 meses</span>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="divide-y divide-border">
              {bridge.map((s) => (
                <li key={s.label} className="flex items-baseline justify-between gap-3 py-2">
                  <span className={`text-[13px] ${s.kind === "total" ? "font-medium text-foreground" : "text-muted"}`}>{s.label}</span>
                  <span
                    className={`tnum text-[13px] ${
                      s.kind === "total" ? "font-semibold text-foreground" : s.value >= 0 ? "text-positive" : "text-negative"
                    }`}
                  >
                    {s.kind === "total" ? formatCLP(s.value) : formatCLP(s.value, { sign: true })}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6">
        <SectionTitle hint="Retorno simple sobre costo, en base económica">Rendimiento por clase de activo</SectionTitle>
        <Card>
          <CardContent className="px-0 py-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Clase de Activo</TableHead>
                  <TableHead className="text-right">Capital Invertido</TableHead>
                  <TableHead className="text-right">Valor Actual</TableHead>
                  <TableHead className="text-right">Ganancia No Realizada</TableHead>
                  <TableHead className="text-right">Retorno Acumulado</TableHead>
                  <TableHead className="text-right">Yield de Caja 12M</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {returns.map((r) => (
                  <TableRow key={r.assetClass}>
                    <TableCell className="font-medium">{ASSET_CLASS_LABELS[r.assetClass]}</TableCell>
                    <TableCell className="text-right">{formatCLP(r.invested)}</TableCell>
                    <TableCell className="text-right">{formatCLP(r.currentValue)}</TableCell>
                    <TableCell className={`text-right ${r.unrealizedGain >= 0 ? "text-positive" : "text-negative"}`}>
                      {formatCLP(r.unrealizedGain, { sign: true })}
                    </TableCell>
                    <TableCell className={`text-right ${r.simpleReturn >= 0 ? "text-positive" : "text-negative"}`}>
                      {formatPct(r.simpleReturn, { sign: true })}
                    </TableCell>
                    <TableCell className="text-right text-muted">{r.cashYieldLTM > 0 ? formatPct(r.cashYieldLTM) : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Métricas de Mercados Privados</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label="IRR" value={pm.irr === null ? "—" : formatPct(pm.irr)} />
              <Metric label="MOIC" value={formatMultiple(pm.moic)} />
              <Metric label="DPI" value={formatMultiple(pm.dpi)} />
              <Metric label="TVPI" value={formatMultiple(pm.tvpi)} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Métricas Inmobiliarias</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label="Cap Rate" value={formatPct(re.weightedCapRate)} />
              <Metric label="NOI" value={formatCLP(re.totalNOI)} />
              <Metric label="LTV" value={formatPct(re.weightedLTV)} />
              <Metric label="Ocupación" value={formatPct(re.weightedOccupancy)} />
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-muted">{label}</p>
      <p className="tnum mt-1 text-[19px] font-semibold leading-none text-foreground">{value}</p>
    </div>
  );
}
