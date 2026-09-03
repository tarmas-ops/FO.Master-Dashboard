import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "./StatusBadge";
import { formatCLP, formatMultiple, formatPct } from "@/lib/formatters";
import type { PerformanceVsPlan, PlanComparison } from "@/lib/calculos";

function formatValue(v: number | null, format: PlanComparison["format"]): string {
  if (v === null) return "—";
  if (format === "clp") return formatCLP(v);
  if (format === "multiple") return formatMultiple(v);
  return formatPct(v);
}

export function ActualVsPlanCard({ plan }: { plan: PerformanceVsPlan }) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Desempeño vs. Caso de Inversión</CardTitle>
          <p className="mt-1 text-[13px] text-muted">¿Nuestra tesis original se está cumpliendo?</p>
        </div>
        <StatusBadge status={plan.status} />
      </CardHeader>
      <CardContent className="pt-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Métrica</TableHead>
              <TableHead className="text-right">Real</TableHead>
              <TableHead className="text-right">Caso Base</TableHead>
              <TableHead className="text-right">Variación</TableHead>
              <TableHead className="text-right">Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {plan.comparisons.map((c) => (
              <TableRow key={c.metric}>
                <TableCell className="font-medium">{c.metric}</TableCell>
                <TableCell className="text-right">{formatValue(c.actual, c.format)}</TableCell>
                <TableCell className="text-right text-muted">{formatValue(c.expected, c.format)}</TableCell>
                <TableCell className={`text-right ${c.variance === null ? "text-muted" : c.variance >= 0 ? "text-positive" : "text-negative"}`}>
                  {c.variance === null ? "—" : c.format === "clp" || c.format === "multiple" ? formatPct(c.variance, { sign: true }) : formatPct(c.variance, { sign: true })}
                </TableCell>
                <TableCell className="text-right">
                  <StatusBadge status={c.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
