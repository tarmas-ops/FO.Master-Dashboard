import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatRow } from "@/components/dashboard/MetricCard";
import { formatCLP, formatDate, formatMultiple, formatPct, formatYears } from "@/lib/formatters";
import type { InvestmentThesis } from "@/types";

export function InvestmentThesisCard({ thesis }: { thesis: InvestmentThesis }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Tesis de Inversión</CardTitle>
        <span className="text-[12px] text-muted">Revisión {thesis.reviewFrequency.toLowerCase()}</span>
      </CardHeader>
      <CardContent>
        <p className="text-[13px] leading-relaxed text-foreground">{thesis.thesis}</p>

        <div className="mt-4 grid grid-cols-1 gap-x-8 sm:grid-cols-2">
          <div>
            <StatRow label="Fecha de Inversión" value={formatDate(thesis.investmentDate)} />
            <StatRow label="Precio de Entrada" value={formatCLP(thesis.entryPrice)} />
            <StatRow label="Equity Inicial" value={formatCLP(thesis.initialEquity)} />
            <StatRow label="Horizonte Esperado" value={formatYears(thesis.expectedHoldPeriod)} />
            <StatRow label="Fecha Objetivo de Salida" value={formatDate(thesis.targetExitDate)} />
            {thesis.entryCapRate !== undefined ? <StatRow label="Cap Rate de Entrada" value={formatPct(thesis.entryCapRate)} /> : null}
            {thesis.targetExitCapRate !== undefined ? <StatRow label="Cap Rate de Salida" value={formatPct(thesis.targetExitCapRate)} /> : null}
          </div>
          <div>
            <StatRow label="Retorno Objetivo" value={formatPct(thesis.targetReturn)} />
            <StatRow label="IRR Caso Base" value={formatPct(thesis.baseCaseIRR)} />
            <StatRow label="IRR Downside" value={formatPct(thesis.downsideIRR)} />
            <StatRow label="IRR Upside" value={formatPct(thesis.upsideIRR)} />
            <StatRow label="MOIC Objetivo" value={formatMultiple(thesis.targetMOIC)} />
            <StatRow label="Cash-on-Cash Objetivo" value={formatPct(thesis.targetCashOnCash)} />
            <StatRow label="Crecimiento Esperado" value={formatPct(thesis.expectedGrowth)} />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-5 border-t border-border pt-4 sm:grid-cols-3">
          <ThesisList title="Razones de Inversión" items={thesis.investmentReasons} />
          <ThesisList title="Principales Riesgos" items={thesis.keyRisks} />
          <ThesisList title="Catalizadores" items={thesis.keyCatalysts} />
        </div>

        <div className="mt-4 border-t border-border pt-3">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted">Supuesto de Salida</p>
          <p className="mt-1 text-[13px] text-foreground">
            {thesis.exitAssumption} Valorización objetivo {formatCLP(thesis.targetExitValuation)}.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function ThesisList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted">{title}</p>
      <ul className="mt-1.5 space-y-1">
        {items.map((t) => (
          <li key={t} className="flex gap-2 text-[13px] leading-relaxed text-foreground">
            <span className="mt-1.5 size-1 shrink-0 rounded-full bg-muted-2" />
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}
