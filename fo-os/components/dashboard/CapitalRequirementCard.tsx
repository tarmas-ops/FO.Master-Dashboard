import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCLP, formatDate } from "@/lib/formatters";
import type { Commitment, CommitmentType, Entity } from "@/types";

const TYPE_LABELS: Record<CommitmentType, string> = {
  CAPITAL_CALL: "Capital Call",
  CAPEX: "CAPEX",
  DEUDA: "Deuda",
  IMPUESTOS: "Impuestos",
  NUEVA_INVERSION: "Nueva Inversión",
};

export function CapitalRequirementCard({ commitments, entities, limit = 6 }: { commitments: Commitment[]; entities: Entity[]; limit?: number }) {
  const names = new Map(entities.map((e) => [e.id, e.name]));
  const rows = [...commitments].sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, limit);
  const total = rows.reduce((a, c) => a + c.amount, 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Compromisos Próximos</CardTitle>
        <span className="tnum text-[12px] text-muted">{formatCLP(total)}</span>
      </CardHeader>
      <CardContent className="pt-0">
        <ul className="divide-y divide-border">
          {rows.map((c) => (
            <li key={c.id} className="flex items-start justify-between gap-4 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-[13px] text-foreground">{c.description}</p>
                <p className="mt-0.5 text-[12px] text-muted">
                  {formatDate(c.dueDate)} · {names.get(c.entityId) ?? c.entityId}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="tnum text-[13px] font-medium text-foreground">{formatCLP(c.amount)}</span>
                <Badge variant="outline">{TYPE_LABELS[c.type]}</Badge>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
