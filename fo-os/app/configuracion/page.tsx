import { CheckCircle2, XCircle } from "lucide-react";
import { StatRow } from "@/components/dashboard/MetricCard";
import { PageHeader } from "@/components/navegacion/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/data";
import { ALERT_THRESHOLDS, calculateNetWorth, validatePortfolioConsistency } from "@/lib/calculos";
import { formatCLP, formatDate, formatNumber, formatPct } from "@/lib/formatters";

export const metadata = { title: "Configuración · Family Office OS" };

export default function ConfiguracionPage() {
  const issues = validatePortfolioConsistency(db);
  const nw = calculateNetWorth(db);

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
            <StatRow label="UF" value={`$${formatNumber(db.fx.UF, 2)}`} />
            <StatRow label="USD" value={`$${formatNumber(db.fx.USD, 2)}`} />
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
            <StatRow label="Reserva mínima de liquidez" value={formatCLP(db.familyOffice.minimumLiquidityReserve)} />
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
                  <TableHead className="text-right">Participación Familiar</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {db.persons.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="text-muted">{p.role}</TableCell>
                    <TableCell className="text-right">{formatPct(p.familyShare, { decimals: 0 })}</TableCell>
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
            <CardTitle>Origen de los Datos</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-[13px] leading-relaxed text-foreground">
              Esta versión usa datos ficticios completamente tipados, definidos en <code className="rounded bg-hover px-1 py-0.5 text-[12px]">/data</code>{" "}
              y consumidos a través del motor financiero en <code className="rounded bg-hover px-1 py-0.5 text-[12px]">/lib/calculos</code>. El
              esquema de PostgreSQL equivalente está en <code className="rounded bg-hover px-1 py-0.5 text-[12px]">/prisma/schema.prisma</code>:
              migrar a base de datos real solo requiere reemplazar la carga de datos, sin tocar la lógica financiera ni las páginas.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
