import { notFound } from "next/navigation";
import { ActualVsPlanCard } from "@/components/inversiones/ActualVsPlanCard";
import { DocumentList } from "@/components/inversiones/DocumentList";
import { InvestmentThesisCard } from "@/components/inversiones/InvestmentThesisCard";
import { ThresholdBadge } from "@/components/inversiones/StatusBadge";
import { MetricCard, StatRow } from "@/components/dashboard/MetricCard";
import { SimpleBarChart } from "@/components/graficos/SimpleBarChart";
import { PageHeader } from "@/components/navegacion/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/data";
import {
  ALERT_THRESHOLDS,
  calculateInvestmentPerformanceVsPlan,
  directAssetIRR,
  realEstateAssets,
  realEstateMetrics,
  unleveredAssetIRR,
} from "@/lib/calculos";
import { formatCLP, formatCLPFull, formatDate, formatMultiple, formatNumber, formatOr, formatPct, formatYears } from "@/lib/formatters";

export function generateStaticParams() {
  return realEstateAssets(db).map((a) => ({ id: a.id }));
}

export default async function ActivoInmobiliarioPage({ params }: PageProps<"/inmobiliario/[id]">) {
  const { id } = await params;
  const asset = realEstateAssets(db).find((a) => a.id === id);
  if (!asset) notFound();

  const m = realEstateMetrics(db, asset);
  const thesis = db.theses.find((t) => t.investmentId === asset.id);
  const plan = calculateInvestmentPerformanceVsPlan(db, asset);
  const documents = db.documents.filter((d) => d.assetId === asset.id);
  const valuations = db.valuations.filter((v) => v.assetId === asset.id).sort((a, b) => a.date.localeCompare(b.date));
  const decisions = db.decisions.filter((d) => d.investmentId === asset.id);
  const initialEquity = thesis?.initialEquity ?? asset.acquisitionCost;
  // Los retornos requieren flujo (NOI) y una fecha de origen. Sin ellos no se estiman:
  // el bloque muestra "s/d" en vez de una IRR construida sobre supuestos inventados.
  const heldYears =
    asset.acquisitionDate === undefined ? null : Math.max(new Date(db.asOf).getFullYear() - new Date(asset.acquisitionDate).getFullYear(), 0);
  const netCashFlow = m.noi === null ? null : Math.max(m.noi - m.annualDebtService, 0);
  const distributionsReceived = netCashFlow === null || heldYears === null ? null : netCashFlow * heldYears;
  const leveredIRR =
    asset.acquisitionDate === undefined || initialEquity === undefined || m.noi === null
      ? null
      : directAssetIRR(asset.acquisitionDate, initialEquity, m.noi - m.annualDebtService, m.equity, db.asOf);
  const unleveredIRR =
    asset.acquisitionDate === undefined || asset.acquisitionCost === undefined || m.noi === null
      ? null
      : unleveredAssetIRR(asset.acquisitionDate, asset.acquisitionCost, m.noi, asset.currentValue, db.asOf);
  const moic =
    initialEquity !== undefined && initialEquity > 0 ? (m.equity + (distributionsReceived ?? 0)) / initialEquity : null;
  const subtitleParts = [
    asset.location,
    asset.surfaceM2 !== undefined ? `${formatNumber(asset.surfaceM2)} m²` : null,
    `Participación económica ${formatPct(m.familyShare)}`,
  ].filter((x): x is string => x !== null);

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Portafolio" }, { label: "Inmobiliario", href: "/inmobiliario" }, { label: asset.name }]}
        eyebrow={asset.subAssetClass}
        title={asset.name}
        subtitle={subtitleParts.join(" · ")}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="outline">{asset.currency}</Badge>
            {m.debt > 0 ? <ThresholdBadge ok={m.ltv <= ALERT_THRESHOLDS.maxLTV}>LTV {formatPct(m.ltv)}</ThresholdBadge> : null}
            {m.dscr !== null ? <ThresholdBadge ok={m.dscr >= ALERT_THRESHOLDS.minDSCR}>DSCR {formatMultiple(m.dscr)}</ThresholdBadge> : null}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Valor Actual" value={formatCLP(asset.currentValue)} hint={`Tasación ${formatDate(asset.lastValuationDate)}`} />
        <MetricCard label="Equity Actual" value={formatCLP(m.equity)} hint={`Atribuible ${formatCLP(m.attributableEquity)}`} />
        <MetricCard
          label="NOI Anual"
          value={formatOr(m.noi, (v) => formatCLP(v))}
          hint={m.capRate === null ? "No informado en la fuente" : `Cap rate ${formatPct(m.capRate)}`}
          tooltip="Net Operating Income: ingresos menos gastos operacionales."
        />
        <MetricCard
          label="Ganancia No Realizada"
          value={formatOr(m.unrealizedGain, (v) => formatCLP(v, { sign: true }))}
          delta={asset.acquisitionCost !== undefined && asset.acquisitionCost > 0 ? asset.currentValue / asset.acquisitionCost - 1 : null}
          hint={asset.acquisitionCost === undefined ? "Sin costo de adquisición registrado" : "vs. costo de adquisición"}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Valorización</CardTitle>
          </CardHeader>
          <CardContent>
            <StatRow label="Valor Actual" value={formatCLP(asset.currentValue)} />
            <StatRow label="Costo de Adquisición" value={formatOr(asset.acquisitionCost, (v) => formatCLP(v))} />
            <StatRow label="Deuda" value={m.debt > 0 ? formatCLP(m.debt) : "—"} />
            <StatRow label="Equity Actual" value={formatCLP(m.equity)} strong />
            <StatRow label="Ganancia No Realizada" value={formatOr(m.unrealizedGain, (v) => formatCLP(v, { sign: true }))} />
            <StatRow label="Método de Valorización" value={asset.valuationMethod} muted />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Operación</CardTitle>
          </CardHeader>
          <CardContent>
            <StatRow label="Ingresos Anuales" value={formatOr(asset.grossRent, (v) => formatCLP(v))} />
            <StatRow label="NOI" value={formatOr(m.noi, (v) => formatCLP(v))} />
            <StatRow label="Ocupación" value={formatOr(asset.occupancy, formatPct)} />
            <StatRow label="WALE" value={formatOr(asset.wale, formatYears)} />
            <StatRow label="Renta por m² (mensual)" value={formatOr(m.rentPerM2, (v) => formatCLPFull(Math.round(v)))} />
            <StatRow label="Cap Rate" value={formatOr(m.capRate, formatPct)} strong />
            {m.noi === null ? (
              <p className="mt-3 text-[12px] leading-relaxed text-muted">
                La fuente registra la valorización del inmueble, no su operación. Al cargar arriendos, gastos y contratos, este bloque se
                completa solo.
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Retornos</CardTitle>
          </CardHeader>
          <CardContent>
            <StatRow label="Equity Inicial" value={formatOr(initialEquity, (v) => formatCLP(v))} />
            <StatRow label="Equity Actual" value={formatCLP(m.equity)} />
            <StatRow label="Flujo Acumulado Recibido" value={formatOr(distributionsReceived, (v) => formatCLP(v))} />
            <StatRow label="MOIC" value={formatOr(moic, (v) => formatMultiple(v))} />
            <StatRow label="IRR Apalancada" value={formatOr(leveredIRR, formatPct)} strong />
            <StatRow label="IRR Sin Apalancamiento" value={formatOr(unleveredIRR, formatPct)} />
            <StatRow label="Cash-on-Cash" value={formatOr(m.cashOnCash, formatPct)} />
          </CardContent>
        </Card>
      </div>

      {m.loans.length > 0 ? (
        <div className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Deuda</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Banco</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
                    <TableHead className="text-right">Tasa</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Amortización</TableHead>
                    <TableHead>Vencimiento</TableHead>
                    <TableHead className="text-right">Servicio Anual</TableHead>
                    <TableHead className="text-right">LTV</TableHead>
                    <TableHead className="text-right">DSCR</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {m.loans.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="font-medium">{l.bank}</TableCell>
                      <TableCell className="text-right">{formatCLP(l.balance)}</TableCell>
                      <TableCell className="text-right">{formatPct(l.rate)}</TableCell>
                      <TableCell className="text-muted">{l.rateType === "FIJA" ? "Fija" : "Variable"}</TableCell>
                      <TableCell className="text-muted">{l.amortization === "BULLET" ? "Bullet" : l.amortization === "MENSUAL" ? "Mensual" : "Trimestral"}</TableCell>
                      <TableCell className="text-muted">{formatDate(l.maturityDate)}</TableCell>
                      <TableCell className="text-right">{formatCLP(l.annualDebtService)}</TableCell>
                      <TableCell className="text-right">{formatPct(l.balance / asset.currentValue)}</TableCell>
                      <TableCell className="text-right">{m.dscr === null ? "—" : formatMultiple(m.dscr)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Histórico de Valorización</CardTitle>
          </CardHeader>
          <CardContent>
            {valuations.length > 0 ? (
              <SimpleBarChart data={valuations.map((v) => ({ label: v.date.slice(0, 4), value: v.value }))} valueLabel="Valorización" />
            ) : (
              <p className="py-14 text-center text-[13px] leading-relaxed text-muted">
                La fuente trae una sola valorización, sin tasaciones anteriores. Al cargar el histórico, este gráfico se completa solo.
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Histórico de NOI</CardTitle>
          </CardHeader>
          <CardContent>
            {(asset.noi ?? 0) > 0 && valuations.length > 0 ? (
              <SimpleBarChart data={valuations.map((v) => ({ label: v.date.slice(0, 4), value: v.noi ?? 0 }))} valueLabel="NOI" />
            ) : (
              <p className="py-14 text-center text-[13px] text-muted">
                {asset.noi === undefined ? "Sin NOI informado en la fuente." : "Este activo no genera NOI (terreno sin explotación)."}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {plan ? (
        <div className="mt-4">
          <ActualVsPlanCard plan={plan} />
        </div>
      ) : null}

      {thesis ? (
        <div className="mt-4">
          <InvestmentThesisCard thesis={thesis} />
        </div>
      ) : null}

      {decisions.length > 0 ? (
        <div className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Decisiones de Inversión</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <ul className="divide-y divide-border">
                {decisions.map((d) => (
                  <li key={d.id} className="py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="dark">{d.decisionType}</Badge>
                      <Badge variant="outline">{d.status}</Badge>
                      <span className="text-[12px] text-muted">
                        {formatDate(d.decisionDate)} · {d.approvedBy}
                      </span>
                    </div>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-foreground">{d.rationale}</p>
                    {d.notes ? <p className="mt-1 text-[12px] text-muted">{d.notes}</p> : null}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {asset.tenants.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Arrendatarios</CardTitle>
              <span className="text-[12px] text-muted">WALE {formatOr(asset.wale, formatYears)}</span>
            </CardHeader>
            <CardContent className="pt-0">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Arrendatario</TableHead>
                    <TableHead className="text-right">Superficie</TableHead>
                    <TableHead className="text-right">Renta Mensual</TableHead>
                    <TableHead className="text-right">Renta Anual</TableHead>
                    <TableHead className="text-right" title="Participación del arrendatario en la renta bruta anual del activo.">
                      % de la Renta
                    </TableHead>
                    <TableHead>Vencimiento</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {asset.tenants.map((t) => (
                    <TableRow key={t.name}>
                      <TableCell className="font-medium">{t.name}</TableCell>
                      <TableCell className="text-right">{formatNumber(t.surfaceM2)} m²</TableCell>
                      <TableCell className="text-right">{formatCLP(t.monthlyRent)}</TableCell>
                      <TableCell className="text-right">{formatCLP(t.monthlyRent * 12)}</TableCell>
                      <TableCell className="text-right">
                        {asset.grossRent !== undefined && asset.grossRent > 0 ? formatPct((t.monthlyRent * 12) / asset.grossRent) : "—"}
                      </TableCell>
                      <TableCell className="text-muted">{formatDate(t.leaseEnd)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : null}
        <DocumentList documents={documents} />
      </div>
    </>
  );
}
