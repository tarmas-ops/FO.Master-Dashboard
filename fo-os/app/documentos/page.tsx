import { MetricCard } from "@/components/dashboard/MetricCard";
import { DOCUMENT_TYPE_LABELS } from "@/components/inversiones/DocumentList";
import { PageHeader } from "@/components/navegacion/PageHeader";
import { DataTable, type TableColumn } from "@/components/tablas/DataTable";
import { Badge } from "@/components/ui/badge";
import { db } from "@/data";
import { formatDate, formatNumber } from "@/lib/formatters";

export const metadata = { title: "Documentos · Family Office OS" };

export default function DocumentosPage() {
  const entityNames = new Map(db.entities.map((e) => [e.id, e.name]));
  const assetNames = new Map(db.assets.map((a) => [a.id, a.name]));
  const loanNames = new Map(db.loans.map((l) => [l.id, l.name]));
  const dealNames = new Map(db.deals.map((d) => [d.id, d.name]));

  const columns: TableColumn[] = [
    { key: "name", header: "Documento" },
    { key: "type", header: "Tipo" },
    { key: "context", header: "Asociado a" },
    { key: "scope", header: "Ámbito" },
    { key: "date", header: "Fecha" },
    { key: "size", header: "Tamaño", align: "right" },
  ];

  const rows = db.documents.map((d) => {
    const context =
      (d.assetId ? assetNames.get(d.assetId) : undefined) ??
      (d.entityId ? entityNames.get(d.entityId) : undefined) ??
      (d.dealId ? dealNames.get(d.dealId) : undefined) ??
      (d.loanId ? loanNames.get(d.loanId) : undefined) ??
      "—";
    const scope = d.assetId ? "Activo" : d.entityId ? "Entidad" : d.dealId ? "Oportunidad" : d.loanId ? "Crédito" : "General";
    return {
      id: d.id,
      values: [d.name, DOCUMENT_TYPE_LABELS[d.type], context, scope, d.uploadedAt, d.sizeKb],
      cells: [
        <span key="n" className="font-medium">{d.name}</span>,
        <Badge key="t" variant="outline">{DOCUMENT_TYPE_LABELS[d.type]}</Badge>,
        <span key="c" className="text-muted">{context}</span>,
        <span key="s" className="text-muted">{scope}</span>,
        <span key="d" className="text-muted">{formatDate(d.uploadedAt)}</span>,
        `${formatNumber(d.sizeKb / 1024, 1)} MB`,
      ],
    };
  });

  const byScope = {
    activos: db.documents.filter((d) => d.assetId).length,
    entidades: db.documents.filter((d) => d.entityId).length,
    deals: db.documents.filter((d) => d.dealId).length,
  };

  return (
    <>
      <PageHeader
        eyebrow="Family Office"
        title="Documentos"
        subtitle="¿Dónde está la documentación de cada activo? Contratos, tasaciones, escrituras y memos, asociados a su entidad, activo, crédito u oportunidad."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Documentos" value={String(db.documents.length)} />
        <MetricCard label="Asociados a Activos" value={String(byScope.activos)} />
        <MetricCard label="Asociados a Entidades" value={String(byScope.entidades)} />
        <MetricCard label="Asociados a Oportunidades" value={String(byScope.deals)} />
      </div>

      <div className="mt-6">
        <DataTable rows={rows} columns={columns} searchPlaceholder="Buscar documento, tipo o activo…" initialSort={{ key: "date", dir: "desc" }} />
      </div>
    </>
  );
}
