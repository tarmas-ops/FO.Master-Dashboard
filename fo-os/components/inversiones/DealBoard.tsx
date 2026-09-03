"use client";

import * as React from "react";
import { CheckCircle2, Circle, CircleDot, MapPin, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { StatRow } from "@/components/dashboard/MetricCard";
import { calculateDealScore, DEAL_STAGE_LABELS, SCORE_WEIGHTS } from "@/lib/calculos";
import { formatCLP, formatDate, formatMultiple, formatPct } from "@/lib/formatters";
import type { Deal, DealScore, DealStage } from "@/types";

const DD_ICON = {
  COMPLETO: <CheckCircle2 className="size-3.5 text-positive" strokeWidth={1.75} />,
  EN_CURSO: <CircleDot className="size-3.5 text-warning" strokeWidth={1.75} />,
  PENDIENTE: <Circle className="size-3.5 text-muted-2" strokeWidth={1.75} />,
};

function DealCard({ deal, onClick }: { deal: Deal; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-md border border-border bg-card p-3 text-left transition-colors hover:border-border-strong hover:bg-hover"
    >
      <p className="text-[13px] font-medium leading-snug text-foreground">{deal.name}</p>
      <div className="mt-1 flex items-center gap-1 text-[11px] text-muted">
        <MapPin className="size-3" strokeWidth={1.75} />
        {deal.location} · {deal.assetType}
      </div>
      <div className="mt-2.5 space-y-1">
        <div className="flex items-baseline justify-between text-[12px]">
          <span className="text-muted">Equity</span>
          <span className="tnum font-medium text-foreground">{formatCLP(deal.equityRequired)}</span>
        </div>
        <div className="flex items-baseline justify-between text-[12px]">
          <span className="text-muted">IRR esperada</span>
          <span className="tnum font-medium text-foreground">{formatPct(deal.expectedIRR)}</span>
        </div>
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1 text-[11px] text-muted-2">
          <User className="size-3" strokeWidth={1.75} />
          {deal.owner}
        </span>
        <Badge variant="outline">{formatPct(deal.closeProbability, { decimals: 0 })}</Badge>
      </div>
    </button>
  );
}

function ScoreBar({ score }: { score: DealScore }) {
  const total = calculateDealScore(score);
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted">Score de Inversión</p>
        <span className="tnum text-[19px] font-semibold text-foreground">{total}/100</span>
      </div>
      <ul className="mt-2 space-y-1.5">
        {(Object.keys(SCORE_WEIGHTS) as Array<keyof DealScore>).map((k) => (
          <li key={k} className="flex items-center gap-2.5 text-[12px]">
            <span className="w-40 shrink-0 text-muted">{SCORE_WEIGHTS[k].label}</span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-hover">
              <span className="block h-full rounded-full bg-foreground" style={{ width: `${score[k]}%` }} />
            </span>
            <span className="tnum w-7 text-right text-foreground">{score[k]}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-muted-2">Ponderado por peso de cada criterio. Ayuda a priorizar; no reemplaza la decisión del comité.</p>
    </div>
  );
}

export function DealBoard({ byStage }: { byStage: Array<{ stage: DealStage; label: string; deals: Deal[]; equity: number }> }) {
  const [selected, setSelected] = React.useState<Deal | null>(null);
  return (
    <>
      <div className="-mx-4 overflow-x-auto px-4 lg:-mx-8 lg:px-8">
        <div className="flex min-w-max gap-3 pb-2">
          {byStage.map((col) => (
            <div key={col.stage} className="w-64 shrink-0">
              <div className="mb-2 flex items-baseline justify-between gap-2 px-0.5">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted">{col.label}</p>
                <span className="tnum text-[11px] text-muted-2">{col.deals.length}</span>
              </div>
              <div className="space-y-2">
                {col.deals.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border px-3 py-6 text-center text-[12px] text-muted-2">Sin oportunidades</div>
                ) : (
                  col.deals.map((d) => <DealCard key={d.id} deal={d} onClick={() => setSelected(d)} />)
                )}
              </div>
              {col.equity > 0 ? <p className="tnum mt-2 px-0.5 text-[11px] text-muted-2">Equity {formatCLP(col.equity)}</p> : null}
            </div>
          ))}
        </div>
      </div>

      <Sheet open={selected !== null} onOpenChange={(o) => !o && setSelected(null)}>
        {selected ? (
          <SheetContent title={selected.name} description={`${selected.assetType} · ${selected.location} · ${DEAL_STAGE_LABELS[selected.stage]}`}>
            <p className="text-[13px] leading-relaxed text-foreground">{selected.summary}</p>

            <div className="mt-5 grid grid-cols-1 gap-x-8 sm:grid-cols-2">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted">Resumen Ejecutivo</p>
                <StatRow label="Valor del Deal" value={formatCLP(selected.dealValue)} />
                <StatRow label="Equity Requerido" value={formatCLP(selected.equityRequired)} />
                <StatRow label="Deuda" value={selected.debt > 0 ? formatCLP(selected.debt) : "—"} />
                <StatRow label="Cap Rate" value={selected.capRate ? formatPct(selected.capRate) : "—"} />
                <StatRow label="Probabilidad de Cierre" value={formatPct(selected.closeProbability, { decimals: 0 })} />
              </div>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted">Retornos Esperados</p>
                <StatRow label="IRR Base" value={formatPct(selected.expectedIRR)} strong />
                <StatRow label="IRR Downside" value={formatPct(selected.downsideIRR)} />
                <StatRow label="IRR Upside" value={formatPct(selected.upsideIRR)} />
                <StatRow label="MOIC" value={formatMultiple(selected.expectedMOIC)} />
                <StatRow label="Cash-on-Cash" value={selected.cashOnCash > 0 ? formatPct(selected.cashOnCash) : "—"} />
              </div>
            </div>

            <div className="mt-5 border-t border-border pt-4">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted">Tesis</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-foreground">{selected.thesis}</p>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
              {selected.risks.length > 0 ? (
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted">Riesgos</p>
                  <ul className="mt-1.5 space-y-1">
                    {selected.risks.map((r) => (
                      <li key={r} className="flex gap-2 text-[13px] leading-relaxed text-foreground">
                        <span className="mt-1.5 size-1 shrink-0 rounded-full bg-muted-2" />
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {selected.catalysts.length > 0 ? (
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted">Catalizadores</p>
                  <ul className="mt-1.5 space-y-1">
                    {selected.catalysts.map((c) => (
                      <li key={c} className="flex gap-2 text-[13px] leading-relaxed text-foreground">
                        <span className="mt-1.5 size-1 shrink-0 rounded-full bg-muted-2" />
                        {c}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>

            {selected.timeline.length > 0 ? (
              <div className="mt-5 border-t border-border pt-4">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted">Timeline</p>
                <ul className="mt-2 space-y-2">
                  {selected.timeline.map((t) => (
                    <li key={t.milestone} className="flex items-center gap-2.5 text-[13px]">
                      {t.done ? <CheckCircle2 className="size-3.5 shrink-0 text-positive" strokeWidth={1.75} /> : <Circle className="size-3.5 shrink-0 text-muted-2" strokeWidth={1.75} />}
                      <span className={t.done ? "text-foreground" : "text-muted"}>{t.milestone}</span>
                      <span className="ml-auto shrink-0 text-[12px] text-muted-2">{formatDate(t.date)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {selected.dueDiligenceStatus.length > 0 ? (
              <div className="mt-5 border-t border-border pt-4">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted">Estado de Due Diligence</p>
                <ul className="mt-2 grid grid-cols-2 gap-2">
                  {selected.dueDiligenceStatus.map((d) => (
                    <li key={d.area} className="flex items-center gap-2 text-[13px] text-foreground">
                      {DD_ICON[d.status]}
                      {d.area}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="mt-5 border-t border-border pt-4">
              <ScoreBar score={selected.score} />
            </div>

            {selected.comments.length > 0 ? (
              <div className="mt-5 border-t border-border pt-4">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted">Comentarios</p>
                <ul className="mt-2 space-y-3">
                  {selected.comments.map((c, i) => (
                    <li key={i}>
                      <p className="text-[12px] text-muted">
                        {c.author} · {formatDate(c.date)}
                      </p>
                      <p className="mt-0.5 text-[13px] leading-relaxed text-foreground">{c.text}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </SheetContent>
        ) : null}
      </Sheet>
    </>
  );
}
