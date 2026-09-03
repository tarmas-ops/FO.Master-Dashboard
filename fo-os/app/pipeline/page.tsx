import { DataGapNotice } from "@/components/dashboard/DataGapNotice";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { DealBoard } from "@/components/inversiones/DealBoard";
import { PageHeader } from "@/components/navegacion/PageHeader";
import { db } from "@/data";
import { calculateInvestmentFirepower, pipelineSummary } from "@/lib/calculos";
import { formatCLP, formatPct } from "@/lib/formatters";

export const metadata = { title: "Pipeline de Inversiones · Family Office OS" };

export default function PipelinePage() {
  const p = pipelineSummary(db.deals);
  const fp = calculateInvestmentFirepower(db);
  const coverage = p.weightedEquity > 0 ? fp.totalCapacity / p.weightedEquity : null;

  return (
    <>
      <PageHeader
        eyebrow="Oportunidades"
        title="Pipeline de Inversiones"
        subtitle="¿Dónde invertiremos próximamente? Click en cualquier oportunidad para ver su tesis, riesgos y estado de due diligence."
      />

      {db.deals.length === 0 ? (
        <DataGapNotice title="Sin oportunidades en evaluación registradas">
          El archivo maestro registra el patrimonio existente, no las inversiones en estudio. Este módulo queda listo para seguir cada
          oportunidad por etapa —originación, due diligence, comité, negociación— con su tesis, equity requerido y probabilidad de cierre.
          Mientras tanto, la capacidad total de inversión disponible es {formatCLP(fp.totalCapacity)}.
        </DataGapNotice>
      ) : (
      <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Oportunidades Activas" value={String(p.activeDeals.length)} hint={`${db.deals.length} en total`} />
        <MetricCard label="Equity en Evaluación" value={formatCLP(p.activeEquity)} hint="Suma de oportunidades activas" />
        <MetricCard
          label="Equity Ponderado"
          value={formatCLP(p.weightedEquity)}
          hint="Ajustado por probabilidad de cierre"
          tooltip="Suma del equity requerido de cada oportunidad multiplicado por su probabilidad de cierre estimada."
        />
        <MetricCard
          label="Cobertura del Pipeline"
          value={coverage === null ? "—" : `${coverage.toFixed(1).replace(".", ",")}x`}
          hint={`Capacidad ${formatCLP(fp.totalCapacity)}`}
          tooltip="Capacidad total de inversión sobre el equity ponderado del pipeline: cuántas veces alcanza el capital disponible para lo que está en evaluación."
        />
      </div>

      <div className="mt-6">
        <DealBoard byStage={p.byStage} />
      </div>

      <p className="mt-4 text-[12px] text-muted">
        IRR promedio esperada de las oportunidades activas: <span className="tnum font-medium text-foreground">{formatPct(p.averageIRR)}</span>
      </p>
      </>
      )}
    </>
  );
}
