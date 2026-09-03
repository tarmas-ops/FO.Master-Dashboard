import { CheckCircle2, XCircle } from "lucide-react";
import { StatRow } from "@/components/dashboard/MetricCard";
import { PageHeader } from "@/components/navegacion/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { activeDataset, db } from "@/data";
import { ALERT_THRESHOLDS, calculateNetWorth, validatePortfolioConsistency } from "@/lib/calculos";
import { formatCLP, formatDate, formatNumber, formatOr, formatPct } from "@/lib/formatters";

export const metadata = { title: "Configuración · Family Office OS" };

export default function ConfiguracionPage() {
  const issues = validatePortfolioConsistency(db);
  const nw = calculateNetWorth(db);
  const coverage = db.dataCoverage;
  // La fuente puede listar a los miembros sin repartir participaciones entre ellos; en ese
  // caso la columna se omite en vez de mostrar 0% para todos.
  const hasFamilyShares = db.persons.some((p) => p.familyShare > 0);

  return (
    <>
      <PageHeader eyebrow="Configuración" title="Configuración" subtitle="Parámetros, monedas y políticas que usan los cálculos de toda la aplicación." />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Tipos de Cambio</CardTitle>
            <span className="text-[12px] text-muted">Al {formatDate(db.fx.asOf)}</span>
          </CardHeader>
          <CardContent>
            <StatRow label="Moneda base" value={db.familyOffice.baseCurrency} />
            <StatRow label="UF" value={formatOr(db.fx.UF > 0 ? db.fx.UF : null, (v) => `$${formatNumber(v, 2)}`)} />
            <StatRow label="USD" value={formatOr(db.fx.USD > 0 ? db.fx.USD : null, (v) => `$${formatNumber(v, 2)}`)} />
            <p className="mt-3 text-[12px] text-muted">
              Los valores de los activos se almacenan en CLP; la moneda de cada activo indica su exposición económica, que alimenta el informe de
              exposición cambiaria.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Políticas de Inversión</CardTitle>
          </CardHeader>
          <CardContent>
            <StatRow
              label="Reserva mínima de liquidez"
              value={formatOr(db.familyOffice.minimumLiquidityReserve > 0 ? db.familyOffice.minimumLiquidityReserve : null, (v) => formatCLP(v))}
            />
            <StatRow label="LTV máximo de política" value={formatPct(db.familyOffice.maxPolicyLTV, { decimals: 0 })} />
            <StatRow label="DSCR mínimo" value={`${formatNumber(ALERT_THRESHOLDS.minDSCR, 1)}x`} />
            <StatRow label="Concentración máxima por activo" value={formatPct(ALERT_THRESHOLDS.maxSingleAssetShare, { decimals: 0 })} />
            <StatRow label="Alerta de vencimiento de deuda" value={`${ALERT_THRESHOLDS.debtMaturityMonths} meses`} />
          </CardContent>
        </Card>
      </div>

      <div className="mt-4">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Conciliación Automática</CardTitle>
              <p className="mt-1 text-[13px] text-muted">
                Verifica que todas las páginas deriven de la misma base: activos menos pasivos igual a patrimonio neto, asignación que suma 100%,
                participaciones que no exceden el 100% y deuda que no supera el valor del activo.
              </p>
            </div>
            <Badge variant={issues.length === 0 ? "positive" : "negative"}>
              {issues.length === 0 ? "Sin inconsistencias" : `${issues.length} problema(s)`}
            </Badge>
          </CardHeader>
          <CardContent>
            {issues.length === 0 ? (
              <div className="flex items-center gap-2.5 rounded-md border border-border bg-positive-soft/40 px-4 py-3">
                <CheckCircle2 className="size-4 text-positive" strokeWidth={1.75} />
                <p className="text-[13px] text-foreground">
                  Activos {formatCLP(nw.totalAssets)} − Pasivos {formatCLP(nw.totalDebt)} = Patrimonio Neto {formatCLP(nw.netWorth)}.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {issues.map((i, idx) => (
                  <li key={idx} className="flex items-start gap-2.5 py-2.5">
                    <XCircle className="mt-0.5 size-4 shrink-0 text-negative" strokeWidth={1.75} />
                    <div>
                      <p className="text-[13px] font-medium text-foreground">{i.check}</p>
                      <p className="text-[12px] text-muted">{i.detail}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4">
        <Card>
          <CardHeader>
            <CardTitle>Miembros del Family Office</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Nombre</TableHead>
                  <TableHead>Rol</TableHead>
                  {hasFamilyShares ? <TableHead className="text-right">Participación Familiar</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {db.persons.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="text-muted">{p.role}</TableCell>
                    {hasFamilyShares ? <TableCell className="text-right">{formatPct(p.familyShare, { decimals: 0 })}</TableCell> : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Origen de los Datos</CardTitle>
              {coverage ? <p className="mt-1 text-[13px] text-muted">{coverage.source} · cargado {coverage.loadedAt}</p> : null}
            </div>
            <Badge variant={activeDataset === "real" ? "positive" : "outline"}>{activeDataset === "real" ? "Datos reales" : "Datos de demostración"}</Badge>
          </CardHeader>
          <CardContent>
            {coverage ? (
              <>
                <p className="text-[13px] leading-relaxed text-foreground">
                  Las cifras provienen del archivo maestro, recalculado con LibreOffice y exportado por{" "}
                  <code className="rounded bg-hover px-1 py-0.5 text-[12px]">scripts/export_real_dataset.py</code>. Solo se carga lo que el
                  archivo contiene: los campos que no existen quedan en blanco, nunca en cero.
                </p>
                {coverage.excelTotals ? (
                  <div className="mt-4">
                    <StatRow label="Activos según el Excel" value={formatCLP(coverage.excelTotals.totalActivos)} />
                    <StatRow label="Activos cargados en la app" value={formatCLP(nw.totalAssets)} />
                    <StatRow label="Pasivos según el Excel" value={formatCLP(coverage.excelTotals.totalPasivos)} />
                    <StatRow label="Pasivos cargados en la app" value={formatCLP(nw.totalDebt)} />
                    <StatRow
                      label="Diferencia en activos"
                      value={formatCLP(nw.totalAssets - coverage.excelTotals.totalActivos, { sign: true })}
                      strong
                    />
                  </div>
                ) : null}
                {coverage.reconciliation && coverage.reconciliation.length > 0 ? (
                  <div className="mt-5">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-muted">Conciliación por línea del balance</p>
                    <Table className="mt-2">
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead>Concepto</TableHead>
                          <TableHead className="text-right">Balance del Excel</TableHead>
                          <TableHead className="text-right">Cargado en la app</TableHead>
                          <TableHead className="text-right">Diferencia</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {coverage.reconciliation.map((r) => {
                          // Redondeo a la unidad: diferencias de centavos son ruido de punto flotante.
                          const diff = Math.round(r.difference);
                          return (
                            <TableRow key={r.concept}>
                              <TableCell className="font-medium">{r.concept}</TableCell>
                              <TableCell className="text-right">{formatCLP(r.excel)}</TableCell>
                              <TableCell className="text-right">{formatCLP(r.app)}</TableCell>
                              <TableCell className={`text-right ${diff === 0 ? "text-muted" : "text-negative"}`}>
                                {diff === 0 ? "—" : formatCLP(diff, { sign: true })}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                    <p className="mt-3 text-[12px] leading-relaxed text-muted">
                      Una diferencia no significa que la app cargó mal: significa que la hoja de balance del Excel no coincide con el detalle de
                      sus propias pestañas. La app carga el detalle, que es la fuente primaria.
                    </p>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="text-[13px] leading-relaxed text-foreground">
                Esta vista usa datos ficticios completamente tipados, definidos en{" "}
                <code className="rounded bg-hover px-1 py-0.5 text-[12px]">/data</code> y consumidos a través del motor financiero en{" "}
                <code className="rounded bg-hover px-1 py-0.5 text-[12px]">/lib/calculos</code>. El esquema de PostgreSQL equivalente está en{" "}
                <code className="rounded bg-hover px-1 py-0.5 text-[12px]">/prisma/schema.prisma</code>: migrar a base de datos real solo
                requiere reemplazar la carga de datos, sin tocar la lógica financiera ni las páginas.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {coverage && coverage.gaps.length > 0 ? (
        <div className="mt-4">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Brechas de Datos</CardTitle>
                <p className="mt-1 text-[13px] text-muted">
                  Qué falta cargar para que cada módulo funcione completo. Nada de esto se rellena con estimaciones.
                </p>
              </div>
              <Badge variant="outline">{coverage.gaps.length} brechas</Badge>
            </CardHeader>
            <CardContent className="pt-0">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Módulo</TableHead>
                    <TableHead>Campo faltante</TableHead>
                    <TableHead>Consecuencia</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {coverage.gaps.map((g, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{g.module}</TableCell>
                      <TableCell>{g.field}</TableCell>
                      <TableCell className="text-muted">{g.detail}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </>
  );
}
