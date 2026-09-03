import { AllocationDonut } from "@/components/graficos/AllocationDonut";
import { ExposureBar } from "@/components/graficos/ExposureBar";
import { PageHeader, SectionTitle } from "@/components/navegacion/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/data";
import {
  calculateCurrencyExposure,
  calculateEconomicExposure,
  calculateEntityExposure,
  calculateGeographicExposure,
  calculatePortfolioAllocation,
  calculateSectorExposure,
  type AllocationStatus,
} from "@/lib/calculos";
import { formatCLP, formatPct } from "@/lib/formatters";

export const metadata = { title: "Asignación · Family Office OS" };

const STATUS_VARIANT: Record<AllocationStatus, "warning" | "neutral" | "info"> = {
  SOBREPONDERADO: "warning",
  NEUTRAL: "neutral",
  SUBPONDERADO: "info",
};

const STATUS_LABELS: Record<AllocationStatus, string> = {
  SOBREPONDERADO: "Sobreponderado",
  NEUTRAL: "Neutral",
  SUBPONDERADO: "Subponderado",
};

export default function AsignacionPage() {
  const allocation = calculatePortfolioAllocation(db);
  const exposure = calculateEconomicExposure(db);

  return (
    <>
      <PageHeader
        eyebrow="Análisis"
        title="Asignación"
        subtitle="¿Dónde estamos expuestos? Exposición económica real, mirando a través de todas las sociedades intermedias."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Asignación Actual vs. Objetivo</CardTitle>
            <span className="text-[12px] text-muted">Banda neutral ±2 puntos</span>
          </CardHeader>
          <CardContent className="pt-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Clase de Activo</TableHead>
                  <TableHead className="text-right">Actual</TableHead>
                  <TableHead className="text-right">Objetivo</TableHead>
                  <TableHead className="text-right">Diferencia</TableHead>
                  <TableHead className="text-right">Monto a Rebalancear</TableHead>
                  <TableHead className="text-right">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allocation.map((a) => (
                  <TableRow key={a.assetClass}>
                    <TableCell className="font-medium">{a.label}</TableCell>
                    <TableCell className="text-right">{formatPct(a.current)}</TableCell>
                    <TableCell className="text-right text-muted">{formatPct(a.target)}</TableCell>
                    <TableCell className={`text-right ${Math.abs(a.current - a.target) > 0.02 ? "text-foreground" : "text-muted"}`}>
                      {formatPct(a.current - a.target, { sign: true })}
                    </TableCell>
                    <TableCell className={`text-right ${a.rebalanceAmount >= 0 ? "text-positive" : "text-negative"}`}>
                      {formatCLP(a.rebalanceAmount, { sign: true })}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant={STATUS_VARIANT[a.status]}>{STATUS_LABELS[a.status]}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="mt-3 text-[12px] text-muted">
              Monto positivo = comprar para alcanzar el objetivo; negativo = reducir. Los montos suman cero, por lo que un rebalanceo completo no
              requiere capital adicional.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Exposición Económica Real</CardTitle>
          </CardHeader>
          <CardContent>
            <AllocationDonut data={exposure.map((e) => ({ label: e.label, value: e.value, share: e.share }))} height={200} />
          </CardContent>
        </Card>
      </div>

      <div className="mt-6">
        <SectionTitle hint="Todas las vistas usan la misma base look-through">Exposición por dimensión</SectionTitle>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardHeader>
              <CardTitle>Por Moneda</CardTitle>
            </CardHeader>
            <CardContent>
              <ExposureBar items={calculateCurrencyExposure(db).map((e) => ({ label: e.label, value: e.value, share: e.share }))} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Por País</CardTitle>
            </CardHeader>
            <CardContent>
              <ExposureBar items={calculateGeographicExposure(db).map((e) => ({ label: e.label, value: e.value, share: e.share }))} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Por Sector</CardTitle>
            </CardHeader>
            <CardContent>
              <ExposureBar items={calculateSectorExposure(db).map((e) => ({ label: e.label, value: e.value, share: e.share }))} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Por Entidad Legal</CardTitle>
            </CardHeader>
            <CardContent>
              <ExposureBar items={calculateEntityExposure(db).map((e) => ({ label: e.label, value: e.value, share: e.share }))} />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
