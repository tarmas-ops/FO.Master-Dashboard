import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCLP, formatPct } from "@/lib/formatters";
import type { RentStream } from "@/types";

export interface RentStreamRow {
  stream: RentStream;
  /** Valor económico de las propiedades vinculadas. 0 si no hay vínculo. */
  linkedValue: number;
  linkedCount: number;
}

/**
 * Un yield bruto fuera de este rango casi nunca es real: delata un vínculo equivocado
 * o un grupo de propiedades incompleto, no una propiedad extraordinaria.
 */
const PLAUSIBLE_YIELD = { min: 0.01, max: 0.12 };

const STATUS_LABEL: Record<RentStream["status"], string> = {
  CONFIRMADO: "Confirmado",
  PROPUESTO: "Por confirmar",
  SIN_IDENTIFICAR: "Sin identificar",
};
const STATUS_VARIANT: Record<RentStream["status"], "positive" | "warning" | "negative"> = {
  CONFIRMADO: "positive",
  PROPUESTO: "warning",
  SIN_IDENTIFICAR: "negative",
};

/**
 * Arriendos tal como los registra el flujo de caja, vinculados a grupos de propiedades.
 * No se reparten entre propiedades individuales: eso exigiría supuestos que la fuente no
 * trae. El yield bruto se calcula sobre el grupo completo, y solo cuando hay vínculo.
 */
export function RentStreamsCard({ rows }: { rows: RentStreamRow[] }) {
  if (rows.length === 0) return null;
  const total = rows.reduce((a, r) => a + r.stream.annualRent, 0);
  const unidentified = rows.filter((r) => r.stream.status === "SIN_IDENTIFICAR").reduce((a, r) => a + r.stream.annualRent, 0);
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Arriendos según el Flujo de Caja</CardTitle>
          <p className="mt-1 text-[13px] text-muted">
            Próximos 12 meses · {formatCLP(total)}
            {unidentified > 0 ? ` · ${formatCLP(unidentified)} (${formatPct(unidentified / total, { decimals: 0 })}) sin propiedad identificada` : ""}
          </p>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Concepto</TableHead>
              <TableHead className="text-right">Arriendo 12M</TableHead>
              <TableHead className="text-right">Propiedades</TableHead>
              <TableHead className="text-right">Valor del grupo</TableHead>
              <TableHead
                className="text-right"
                title="Arriendo anual sobre el valor económico de las propiedades vinculadas. Si el vínculo es incorrecto, el yield también."
              >
                Yield bruto
              </TableHead>
              <TableHead>Vínculo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows
              .slice()
              .sort((a, b) => b.stream.annualRent - a.stream.annualRent)
              .map(({ stream, linkedValue, linkedCount }) => (
                <TableRow key={stream.id}>
                  <TableCell className="font-medium" title={stream.note ?? undefined}>
                    {stream.concept}
                  </TableCell>
                  <TableCell className="text-right">{formatCLP(stream.annualRent)}</TableCell>
                  <TableCell className="text-right text-muted">{linkedCount > 0 ? linkedCount : "—"}</TableCell>
                  <TableCell className="text-right text-muted">{linkedValue > 0 ? formatCLP(linkedValue) : "—"}</TableCell>
                  <TableCell className="text-right">
                    {linkedValue > 0 ? (
                      (() => {
                        const y = stream.annualRent / linkedValue;
                        const implausible = y > PLAUSIBLE_YIELD.max || y < PLAUSIBLE_YIELD.min;
                        return implausible ? (
                          <span className="text-warning" title="Yield fuera de lo plausible: probablemente el vínculo está mal o el grupo de propiedades está incompleto.">
                            {formatPct(y)} · revisar
                          </span>
                        ) : (
                          formatPct(y)
                        );
                      })()
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[stream.status]}>{STATUS_LABEL[stream.status]}</Badge>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
        <p className="mt-3 text-[12px] leading-relaxed text-muted">
          El flujo de caja registra arriendos por concepto, no por propiedad, así que el vínculo con los inmuebles es una inferencia por nombre.
          Pasa el cursor sobre un concepto para ver el criterio. Los vínculos se confirman o corrigen en{" "}
          <code className="rounded bg-hover px-1 py-0.5 text-[11px]">scripts/rent_mapping.json</code>.
        </p>
      </CardContent>
    </Card>
  );
}
