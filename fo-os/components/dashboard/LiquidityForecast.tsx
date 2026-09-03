import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatRow } from "./MetricCard";
import { formatCLP, formatMultiple } from "@/lib/formatters";
import type { LiquidityCoverage } from "@/lib/calculos";

export function LiquidityForecast({ coverages }: { coverages: LiquidityCoverage[] }) {
  const detail = coverages[coverages.length - 1];
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Cobertura de Liquidez</CardTitle>
          <p className="mt-1 text-[13px] text-muted">Fuentes disponibles sobre compromisos del período</p>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {coverages.map((c) => (
            <div key={c.horizonMonths} className="rounded-md border border-border px-3 py-2.5">
              <p className="text-[11px] uppercase tracking-wider text-muted">{c.horizonMonths} meses</p>
              <p className={`tnum mt-1 text-[19px] font-semibold leading-none ${c.coverage !== null && c.coverage < 1 ? "text-negative" : "text-foreground"}`}>
                {c.coverage === null ? "—" : formatMultiple(c.coverage, 1)}
              </p>
              <p className="mt-1 text-[11px] text-muted">usos {formatCLP(c.uses)}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 border-t border-border pt-3">
          <div className="mb-1 flex items-center justify-between">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted">Compromisos a {detail.horizonMonths} meses</p>
            <Badge variant="outline">{formatCLP(detail.uses)}</Badge>
          </div>
          <StatRow label="Capital Calls" value={formatCLP(detail.usesByType.capitalCalls)} />
          <StatRow label="Vencimientos de Deuda" value={formatCLP(detail.usesByType.debtMaturities)} />
          <StatRow label="CAPEX" value={formatCLP(detail.usesByType.capex)} />
          <StatRow label="Impuestos" value={formatCLP(detail.usesByType.taxes)} />
          <StatRow label="Nuevas Inversiones Comprometidas" value={formatCLP(detail.usesByType.newInvestments)} />
          <StatRow label="Fuentes Disponibles" value={formatCLP(detail.sources)} strong />
        </div>
      </CardContent>
    </Card>
  );
}
