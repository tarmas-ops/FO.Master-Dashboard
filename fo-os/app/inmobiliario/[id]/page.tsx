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
import { formatCLP, formatCLPFull, formatDate, formatMultiple, formatNumber, formatPct, formatYears } from "@/lib/formatters";

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
  const distributionsReceived = Math.max(m.noi - m.annualDebtService, 0) * Math.max(new Date(db.asOf).getFullYear() - new Date(asset.acquisitionDate).getFullYear(), 0);
  const leveredIRR = directAssetIRR(asset.acquisitionDate, initialEquity, m.noi - m.annualDebtService, m.equity, db.asOf);
  const unleveredIRR = unleveredAssetIRR(asset.acquisitionDate, asset.acquisitionCost, m.noi, asset.currentValue, db.asOf);
  const moic = initialEquity > 0 ? (m.equity + distributionsReceived) / initialEquity : null;

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Portafolio" }, { label: "Inmobiliario", href: "/inmobiliario" }, { label: asset.name }]}
        eyebrow={asset.subAssetClass}
        title={asset.name}
        subtitle={`${asset.location} · ${formatNumber(asset.surfaceM2)} m² · Participación económica ${formatPct(m.familyShare)}`}
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
        <MetricCard label="NOI Anual" value={formatCLP(m.noi)} hint={`Cap rate ${formatPct(m.capRate)}`} tooltip="Net Operating Income: ingresos menos gastos operacionales." />
        <MetricCard
          label="Ganancia No Realizada"
          value={formatCLP(m.unrealizedGain, { sign: true })}
          delta={asset.acquisitionCost > 0 ? asset.currentValue / asset.acquisitionCost - 1 : null}
          hint="vs. costo de adquisición"
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Valorización</CardTitle>
          </CardHeader>
          <CardContent>
            <StatRow label="Valor Actual" value={formatCLP(asset.currentValue)} />
            <StatRow label="Costo de Adquisición" value={formatCLP(asset.acquisitionCost)} />
            <StatRow label="Deuda" value={m.debt > 0 ? formatCLP(m.debt) : "—"} />
            <StatRow label="Equity Actual" value={formatCLP(m.equity)} strong />
            <StatRow label="Ganancia No Realizada" value={formatCLP(m.unrealizedGain, { sign: true })} />
            <StatRow label="Método de Valorización" value={asset.valuationMethod} muted />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Operación</CardTitle>
          </CardHeader>
          <CardContent>
            <StatRow label="Ingresos Anuales" value={formatCLP(asset.grossRent)} />
            <StatRow label="NOI" value={formatCLP(m.noi)} />
            <StatRow label="Ocupación" value={asset.occupancy > 0 ? formatPct(asset.occupancy) : "—"} />
            <StatRow label="WALE" value={asset.wale > 0 ? formatYears(asset.wale) : "—"} />
            <StatRow label="Renta por m² (mensual)" value={m.rentPerM2 > 0 ? formatCLPFull(Math.round(m.rentPerM2)) : "—"} />
            <StatRow label="Cap Rate" value={m.capRate > 0 ? formatPct(m.capRate) : "—"} strong />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Retornos</CardTitle>
          </CardHeader>
          <CardContent>
            <StatRow label="Equity Inicial" value={formatCLP(initialEquity)} />
            <StatRow label="Equity Actual" value={formatCLP(m.equity)} />
            <StatRow label="Flujo Acumulado Recibido" value={formatCLP(distributionsReceived)} />
            <StatRow label="MOIC" value={moic === null ? "—" : formatMultiple(moic)} />
            <StatRow label="IRR Apalancada" value={leveredIRR === null ? "—" : formatPct(leveredIRR)} strong />
            <StatRow label="IRR Sin Apalancamiento" value={unleveredIRR === null ? "—" : formatPct(unleveredIRR)} />
            <StatRow label="Cash-on-Cash" value={formatPct(m.cashOnCash)} />
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
            <SimpleBarChart data={valuations.map((v) => ({ label: v.date.slice(0, 4), value: v.value }))} valueLabel="Valorización" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Histórico de NOI</CardTitle>
          </CardHeader>
          <CardContent>
            {asset.noi > 0 ? (
              <SimpleBarChart data={valuations.map((v) => ({ label: v.date.slice(0, 4), value: v.noi ?? 0 }))} valueLabel="NOI" />
            ) : (
              <p className="py-14 text-center text-[13px] text-muted">Este activo no genera NOI (terreno sin explotación).</p>
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
              <span className="text-[12px] text-muted">WALE {formatYears(asset.wale)}</span>
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
                      <TableCell className="text-right">{asset.grossRent > 0 ? formatPct((t.monthlyRent * 12) / asset.grossRent) : "—"}</TableCell>
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
