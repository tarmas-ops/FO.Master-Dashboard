import { Badge } from "@/components/ui/badge";
import { PLAN_STATUS_LABELS, type PlanStatus } from "@/lib/calculos";

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
