import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ValuationBadge } from "@/components/inversiones/StatusBadge";
import { VALUATION_QUALITY_HINTS, type ValuationQualityBreakdown } from "@/lib/calculos";
import { formatCLP, formatPct } from "@/lib/formatters";

/**
 * Cuánto del patrimonio descansa en un número sólido y cuánto en una estimación.
 * Un total se ve igual de preciso sea que venga de tasaciones o de proxies; este desglose
 * es lo que permite al lector pesar la cifra que tiene arriba.
 */
export function ValuationQualityCard({ breakdown }: { breakdown: ValuationQualityBreakdown }) {
  if (breakdown.rows.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Calidad de la Valorización</CardTitle>
          <p className="mt-1 text-[13px] text-muted">En qué se apoya cada peso del patrimonio</p>
        </div>
        {breakdown.estimatedShare > 0.05 ? (
          <span className="text-[12px] text-warning">{formatPct(breakdown.estimatedShare, { decimals: 0 })} es estimación</span>
        ) : null}
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex h-2 w-full overflow-hidden rounded-full bg-hover" aria-hidden>
          {breakdown.rows.map((r) => (
            <div
              key={r.quality}
              className={
                r.quality === "TASADO"
                  ? "bg-positive"
                  : r.quality === "PROXY"
                    ? "bg-warning"
                    : r.quality === "SIN_DATO"
                      ? "bg-negative"
                      : "bg-foreground/40"
              }
              style={{ width: `${r.share * 100}%` }}
            />
          ))}
        </div>
        <ul className="mt-4 divide-y divide-border">
          {breakdown.rows.map((r) => (
            <li key={r.quality} className="flex items-start justify-between gap-4 py-2.5">
              <div className="min-w-0">
                <ValuationBadge quality={r.quality} />
                <p className="mt-1 text-[12px] leading-relaxed text-muted">{VALUATION_QUALITY_HINTS[r.quality]}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="tnum text-[13px] font-medium text-foreground">{formatCLP(r.value)}</p>
                <p className="tnum text-[12px] text-muted">
                  {formatPct(r.share)} · {r.count} {r.count === 1 ? "activo" : "activos"}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
