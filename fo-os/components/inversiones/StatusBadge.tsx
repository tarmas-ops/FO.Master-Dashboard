import { Badge } from "@/components/ui/badge";
import { PLAN_STATUS_LABELS, VALUATION_QUALITY_HINTS, VALUATION_QUALITY_LABELS, type PlanStatus } from "@/lib/calculos";
import type { ValuationQuality } from "@/types";

const VARIANT: Record<PlanStatus, "positive" | "neutral" | "negative" | "warning"> = {
  SOBRE_PLAN: "positive",
  EN_LINEA: "neutral",
  BAJO_PLAN: "negative",
  REVISION_REQUERIDA: "warning",
};

export function StatusBadge({ status }: { status: PlanStatus }) {
  return <Badge variant={VARIANT[status]}>{PLAN_STATUS_LABELS[status]}</Badge>;
}

/** Semáforo genérico: verde si el valor está dentro de política, rojo si la rompe. */
export function ThresholdBadge({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return <Badge variant={ok ? "neutral" : "negative"}>{children}</Badge>;
}

const QUALITY_VARIANT: Record<ValuationQuality, "positive" | "neutral" | "warning" | "negative" | "outline"> = {
  TASADO: "positive",
  SALDO: "neutral",
  CONTABLE: "neutral",
  PROXY: "warning",
  SIN_DATO: "negative",
};

/** Qué tan sólido es el valor de un activo. Un proxy o un "sin dato" no deben pasar por tasado. */
export function ValuationBadge({ quality }: { quality: ValuationQuality | undefined }) {
  if (!quality) return <Badge variant="outline">—</Badge>;
  return (
    <Badge variant={QUALITY_VARIANT[quality]} title={VALUATION_QUALITY_HINTS[quality]}>
      {VALUATION_QUALITY_LABELS[quality]}
    </Badge>
  );
}
