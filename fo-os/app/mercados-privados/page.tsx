import { MetricCard } from "@/components/dashboard/MetricCard";
import { GroupedBarChart } from "@/components/graficos/GroupedBarChart";
import { PageHeader } from "@/components/navegacion/PageHeader";
import { DataTable, type TableColumn } from "@/components/tablas/DataTable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/data";
import { privateMarketsSummary } from "@/lib/calculos";
import { formatCLP, formatMultiple, formatPct } from "@/lib/formatters";

export const metadata = { title: "Mercados Privados · Family Office OS" };

/** Contribuciones (capital calls) vs distribuciones por trimestre. */
function quarterlyFlows() {
  const map = new Map<string, { label: string; Contribuciones: number; Distribuciones: number }>();
  const key = (d: string) => `${d.slice(0, 4)}-T${Math.floor(Number(d.slice(5, 7)) / 3.01) + 1}`;
  for (const c of db.capitalCalls) {
    const k = key(c.dueDate);
    const row = map.get(k) ?? { label: k, Contribuciones: 0, Distribuciones: 0 };
    row.Contribuciones += c.amount;
    map.set(k, row);
  }
  for (const d of db.distributions) {
    const k = key(d.date);
    const row = map.get(k) ?? { label: k, Contribuciones: 0, Distribuciones: 0 };
    row.Distribuciones += d.amount;
    map.set(k, row);
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
}

export default function MercadosPrivadosPage() {
  const s = privateMarketsSummary(db);

  const columns: TableColumn[] = [
    { key: "name", header: "Inversión" },
    { key: "manager", header: "Gestor" },
    { key: "vintage", header: "Vintage", align: "right" },
    { key: "committed", header: "Comprometido", align: "right" },
    { key: "called", header: "Capital Llamado", align: "right" },
    { key: "distributed", header: "Distribuciones", align: "right" },
    { key: "nav", header: "NAV", align: "right", tooltip: "Net Asset Value: valor del fondo reportado por el gestor." },
    { key: "pending", header: "Capital Pendiente", align: "right" },
    { key: "moic", header: "MOIC", align: "right", tooltip: "Multiple on Invested Capital: (distribuciones + NAV) sobre capital llamado." },
    { key: "irr", header: "IRR", align: "right", tooltip: "Tasa interna de retorno anualizada considerando capital llamado, distribuciones y NAV actual." },
  ];

  const rows = s.rows.map((r) => ({
    id: r.fund.id,
    values: [r.fund.name, r.fund.manager, r.fund.vintage, r.fund.committed, r.fund.called, r.fund.distributed, r.fund.nav, r.pending, r.moic, r.irr],
    cells: [
      <span key="n" className="font-medium">{r.fund.name}</span>,
      <span key="m" className="text-muted">{r.fund.manager}</span>,
      String(r.fund.vintage),
      formatCLP(r.fund.committed),
      formatCLP(r.fund.called),
      formatCLP(r.fund.distributed),
      formatCLP(r.fund.nav),
      formatCLP(r.pending),
      formatMultiple(r.moic),
      <span key="i" className={r.irr !== null && r.irr < 0 ? "text-negative" : undefined}>{r.irr === null ? "—" : formatPct(r.irr)}</span>,
    ],
  }));

  return (
    <>
      <PageHeader
        eyebrow="Portafolio"
        title="Mercados Privados"
        subtitle="¿Cómo están rindiendo nuestras inversiones ilíquidas? Métricas calculadas desde capital calls, distribuciones y NAV reportado."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        <MetricCard label="Capital Comprometido" value={formatCLP(s.committed)} />
        <MetricCard label="Capital Invertido" value={formatCLP(s.called)} hint={`Pendiente ${formatCLP(s.pending)}`} />
        <MetricCard label="NAV Actual" value={formatCLP(s.nav)} />
        <MetricCard label="Distribuciones" value={formatCLP(s.distributed)} />
        <MetricCard label="IRR del Portafolio" value={s.irr === null ? "—" : formatPct(s.irr)} tooltip="IRR agregada de todos los fondos, considerando el NAV actual como valor terminal." />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <MetricCard label="MOIC del Portafolio" value={formatMultiple(s.moic)} tooltip="Multiple on Invested Capital: (distribuciones + NAV) sobre capital llamado." />
        <MetricCard label="DPI" value={formatMultiple(s.dpi)} tooltip="Distributions to Paid-In: cuánto se ha devuelto en efectivo por cada peso llamado." />
        <MetricCard label="TVPI" value={formatMultiple(s.tvpi)} tooltip="Total Value to Paid-In: valor total (distribuciones + NAV) por cada peso llamado." />
      </div>

      <div className="mt-6">
        <DataTable rows={rows} columns={columns} initialSort={{ key: "nav", dir: "desc" }} searchable={false} />
      </div>

      <div className="mt-4">
        <Card>
          <CardHeader>
            <CardTitle>Contribuciones vs. Distribuciones</CardTitle>
            <span className="text-[12px] text-muted">Por trimestre, incluye llamados pendientes</span>
          </CardHeader>
          <CardContent>
            <GroupedBarChart
              data={quarterlyFlows()}
              keys={[
                { key: "Contribuciones", label: "Contribuciones (capital calls)" },
                { key: "Distribuciones", label: "Distribuciones" },
              ]}
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
