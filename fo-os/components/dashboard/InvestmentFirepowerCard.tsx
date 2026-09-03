import { Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { StatRow } from "./MetricCard";
import { formatCLP, formatPct } from "@/lib/formatters";
import type { InvestmentFirepower } from "@/lib/calculos";

const TOOLTIP =
  "La Capacidad Total de Inversión estima cuánto capital puede desplegar el Family Office sin comprometer su reserva mínima de liquidez, considerando caja, activos líquidos, líneas disponibles y capacidad adicional de deuda.";

export function InvestmentFirepowerCard({ fp }: { fp: InvestmentFirepower }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          Capacidad de Inversión
          <Tooltip>
            <TooltipTrigger aria-label="Cómo se calcula la capacidad de inversión" className="text-muted-2 hover:text-foreground">
              <Info className="size-3" />
            </TooltipTrigger>
            <TooltipContent>{TOOLTIP}</TooltipContent>
          </Tooltip>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <StatRow label="Caja" value={formatCLP(fp.cash)} />
        <StatRow label="Activos Líquidos" value={formatCLP(fp.liquidAssets)} />
        <StatRow label="Líneas de Crédito Disponibles" value={formatCLP(fp.availableCreditLines)} />
        <StatRow label="Liquidez Bruta" value={formatCLP(fp.grossLiquidity)} strong />

        <div className="mt-3">
          <StatRow label="Reserva Mínima de Liquidez" value={`−${formatCLP(fp.minimumReserve)}`} muted negative />
          <StatRow label="Capital Calls Próximos (12m)" value={`−${formatCLP(fp.upcomingCapitalCalls)}`} muted negative />
          <StatRow label="CAPEX Comprometido (12m)" value={`−${formatCLP(fp.committedCapex)}`} muted negative />
          <StatRow label="Capital Desplegable" value={formatCLP(fp.deployableCapital)} strong />
        </div>

        <div className="mt-3">
          <StatRow label={`Capacidad Adicional de Deuda (LTV ${formatPct(fp.policyLTV, { decimals: 0 })})`} value={formatCLP(fp.additionalDebtCapacity)} muted />
        </div>

        <div className="mt-4 rounded-lg bg-foreground px-4 py-3.5">
          <p className="text-[11px] font-medium uppercase tracking-wider text-white/60">Capacidad Total de Inversión</p>
          <p className="tnum mt-1 text-[28px] font-semibold leading-none tracking-tight text-white">{formatCLP(fp.totalCapacity)}</p>
        </div>
      </CardContent>
    </Card>
  );
}
