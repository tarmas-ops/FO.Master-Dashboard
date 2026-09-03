import { EntityTree } from "@/components/entidades/EntityTree";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { PageHeader, SectionTitle } from "@/components/navegacion/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/data";
import { buildOwnershipTree, calculateEntityExposure, calculateNetWorth, familyOwnershipOfEntity } from "@/lib/calculos";
import { formatCLP, formatPct } from "@/lib/formatters";

export const metadata = { title: "Estructura Patrimonial · Family Office OS" };

const ENTITY_TYPE_LABELS: Record<string, string> = {
  FAMILY_OFFICE: "Family Office",
  HOLDING: "Holding",
  SPV: "SPV",
  OPERATING_COMPANY: "Sociedad Operativa",
  FUND: "Fondo",
  PERSON: "Persona",
};

export default function EstructuraPage() {
  const tree = buildOwnershipTree(db);
  const nw = calculateNetWorth(db);
  const byEntity = calculateEntityExposure(db);
  const spvs = db.entities.filter((e) => e.entityType === "SPV").length;
  const holdings = db.entities.filter((e) => e.entityType === "HOLDING").length;

  return (
    <>
      <PageHeader
        eyebrow="Family Office"
        title="Estructura Patrimonial"
        subtitle="¿Qué posee realmente la familia? La participación económica se calcula recursivamente; nunca se almacena."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Entidades" value={String(db.entities.length)} hint={`${holdings} holdings · ${spvs} SPV`} />
        <MetricCard label="Activos" value={String(db.assets.length)} hint="Bajo la estructura" />
        <MetricCard label="Equity Atribuible" value={formatCLP(tree.attributableEquity)} hint="Suma del árbol completo" />
        <MetricCard label="Patrimonio Neto" value={formatCLP(nw.netWorth)} hint="Activos − Pasivos" />
      </div>

      <div className="mt-6">
        <SectionTitle hint="Click en cualquier nodo para ver su detalle">Árbol de Participaciones</SectionTitle>
        <EntityTree root={tree} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Entidades</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Entidad</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>RUT</TableHead>
                  <TableHead className="text-right">Participación Económica</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {db.entities.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">{e.name}</TableCell>
                    <TableCell className="text-muted">{ENTITY_TYPE_LABELS[e.entityType]}</TableCell>
                    <TableCell className="text-muted">{e.taxId ?? "—"}</TableCell>
                    <TableCell className="text-right">{formatPct(familyOwnershipOfEntity(db, e.id))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Exposición por Entidad Legal</CardTitle>
            <span className="text-[12px] text-muted">Valor económico de los activos que posee directamente</span>
          </CardHeader>
          <CardContent className="pt-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Entidad</TableHead>
                  <TableHead className="text-right">Valor Económico</TableHead>
                  <TableHead className="text-right">% del Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byEntity.map((e) => (
                  <TableRow key={e.key}>
                    <TableCell className="font-medium">{e.label}</TableCell>
                    <TableCell className="text-right">{formatCLP(e.value)}</TableCell>
                    <TableCell className="text-right">{formatPct(e.share)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Cómo se calcula la participación económica</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-[13px] leading-relaxed text-foreground">
              La participación económica de un activo es el producto de todas las participaciones directas en la cadena que va desde el Family
              Office hasta el activo. Por ejemplo, el Family Office posee 100% de Andes Holding, que posee 100% de Cordillera Investments, que a
              su vez posee 85% de Pacific Real Estate: la participación económica sobre los activos de esa SPV es{" "}
              <span className="tnum font-medium">100% × 100% × 85% = {formatPct(familyOwnershipOfEntity(db, "pacific-re"))}</span>. Todas las
              cifras de asignación, exposición y patrimonio de la aplicación usan esta base, evitando el doble conteo entre sociedades.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
