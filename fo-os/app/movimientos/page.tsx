import { MetricCard } from "@/components/dashboard/MetricCard";
import { PageHeader } from "@/components/navegacion/PageHeader";
import { DataTable, type TableColumn } from "@/components/tablas/DataTable";
import { Badge } from "@/components/ui/badge";
import { db } from "@/data";
import { CATEGORY_LABELS, calculateCashFlow, trailingMonths } from "@/lib/calculos";
import { formatCLP, formatDate } from "@/lib/formatters";

export const metadata = { title: "Movimientos · Family Office OS" };

export default function MovimientosPage() {
  const entityNames = new Map(db.entities.map((e) => [e.id, e.name]));
  const assetNames = new Map(db.assets.map((a) => [a.id, a.name]));
  const { from, to } = trailingMonths(db.asOf, 12);
  const ltm = calculateCashFlow(db, from, to, true);

  /** El ledger completo es largo; se muestran los 18 meses más recientes alrededor de hoy. */
  const cutoff = new Date(db.asOf);
  cutoff.setMonth(cutoff.getMonth() - 12);
  const horizon = new Date(db.asOf);
  horizon.setMonth(horizon.getMonth() + 6);
  const visible = db.transactions.filter((t) => {
    const d = new Date(t.date);
    return d >= cutoff && d <= horizon;
  });

  const columns: TableColumn[] = [
    { key: "date", header: "Fecha" },
    { key: "entity", header: "Entidad" },
    { key: "asset", header: "Activo" },
    { key: "category", header: "Categoría" },
    { key: "description", header: "Descripción" },
    { key: "status", header: "Estado" },
    { key: "amount", header: "Monto", align: "right" },
  ];

  const rows = visible.map((t) => ({
    id: t.id,
    values: [
      t.date,
      entityNames.get(t.entityId) ?? t.entityId,
      t.assetId ? (assetNames.get(t.assetId) ?? "—") : "—",
      CATEGORY_LABELS[t.category],
      t.description,
      t.realized ? "Realizado" : "Proyectado",
      t.type === "INGRESO" ? t.amount : -t.amount,
    ],
    cells: [
      <span key="d" className="text-muted">{formatDate(t.date)}</span>,
      <span key="e" className="text-muted">{entityNames.get(t.entityId) ?? t.entityId}</span>,
      <span key="a" className="text-muted">{t.assetId ? (assetNames.get(t.assetId) ?? "—") : "—"}</span>,
      CATEGORY_LABELS[t.category],
      <span key="ds" className="text-muted">{t.description}</span>,
      <Badge key="s" variant={t.realized ? "neutral" : "outline"}>{t.realized ? "Realizado" : "Proyectado"}</Badge>,
      <span key="m" className={t.type === "INGRESO" ? "text-positive" : "text-foreground"}>
        {t.type === "INGRESO" ? formatCLP(t.amount, { sign: true }) : `−${formatCLP(t.amount)}`}
      </span>,
    ],
  }));

  // El rango real del ledger se lee de los propios movimientos, no de un supuesto fijo.
  const dates = db.transactions.map((t) => t.date).sort();
  const rangeHint = dates.length > 0 ? `${formatDate(dates[0]!)} a ${formatDate(dates[dates.length - 1]!)}` : undefined;
  const hasHistory = ltm.months.some((m) => m.income !== 0 || m.expenses !== 0);
  const historyHint = hasHistory ? undefined : "Sin meses cerrados en la fuente";

  return (
    <>
      <PageHeader
        eyebrow="Family Office"
        title="Movimientos"
        subtitle="¿Qué entró y qué salió? Ledger consolidado que alimenta el flujo de caja, los saldos y las métricas de rendimiento."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Movimientos Registrados" value={String(db.transactions.length)} hint={rangeHint} />
        <MetricCard label="Ingresos 12 Meses" value={hasHistory ? formatCLP(ltm.income) : "s/d"} hint={historyHint} />
        <MetricCard label="Egresos 12 Meses" value={hasHistory ? formatCLP(ltm.expenses) : "s/d"} hint={historyHint} />
        <MetricCard label="Flujo Neto 12 Meses" value={hasHistory ? formatCLP(ltm.net, { sign: true }) : "s/d"} hint={historyHint} />
      </div>

      <div className="mt-6">
        <DataTable
          rows={rows}
          columns={columns}
          searchPlaceholder="Buscar por entidad, activo, categoría o descripción…"
          initialSort={{ key: "date", dir: "desc" }}
        />
        <p className="mt-2 text-[12px] text-muted">
          Mostrando {visible.length} movimientos entre los últimos 12 meses y los próximos 6. Los montos son al 100% de la entidad; el flujo de caja
          los pondera por participación económica.
        </p>
      </div>
    </>
  );
}
