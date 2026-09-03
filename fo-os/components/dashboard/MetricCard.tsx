import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatPct } from "@/lib/formatters";

export function DeltaBadge({ value, className }: { value: number | null; className?: string }) {
  if (value === null) return null;
  const positive = value >= 0;
  return (
    <span className={cn("tnum text-[12px] font-medium", positive ? "text-positive" : "text-negative", className)}>
      {formatPct(value, { sign: true })}
    </span>
  );
}

export function MetricCard({
  label,
  value,
  delta,
  hint,
  tooltip,
  emphasis = false,
  className,
}: {
  label: string;
  value: string;
  delta?: number | null;
  hint?: string;
  tooltip?: string;
  emphasis?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border border-border bg-card px-5 py-4", emphasis && "border-foreground/15 bg-foreground text-white", className)}>
      <div className="flex items-center gap-1.5">
        <p className={cn("text-[11px] font-medium uppercase tracking-wider", emphasis ? "text-white/60" : "text-muted")}>{label}</p>
        {tooltip ? (
          <Tooltip>
            <TooltipTrigger aria-label={`Información sobre ${label}`} className={cn(emphasis ? "text-white/50" : "text-muted-2", "hover:text-foreground")}>
              <Info className="size-3" />
            </TooltipTrigger>
            <TooltipContent>{tooltip}</TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      <p className={cn("tnum mt-1.5 text-[21px] font-semibold leading-tight tracking-tight xl:text-[23px]", emphasis ? "text-white" : "text-foreground")}>{value}</p>
      <div className="mt-1.5 flex items-center gap-2">
        {delta !== undefined ? <DeltaBadge value={delta ?? null} /> : null}
        {hint ? <p className={cn("text-[12px]", emphasis ? "text-white/60" : "text-muted")}>{hint}</p> : null}
      </div>
    </div>
  );
}

export function StatRow({ label, value, strong = false, muted = false, negative = false }: { label: string; value: string; strong?: boolean; muted?: boolean; negative?: boolean }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4 py-1.5", strong && "border-t border-border pt-2.5 mt-1")}>
      <span className={cn("text-[13px]", muted ? "text-muted" : "text-foreground", strong && "font-medium")}>{label}</span>
      <span className={cn("tnum text-[13px]", strong ? "font-semibold text-foreground" : negative ? "text-negative" : "text-foreground")}>{value}</span>
    </div>
  );
}
