import { MetricCard } from "@/components/dashboard/MetricCard";
import { PageHeader } from "@/components/navegacion/PageHeader";
import { DataTable, type TableColumn } from "@/components/tablas/DataTable";
import { ThresholdBadge } from "@/components/inversiones/StatusBadge";
import { db } from "@/data";
import { ALERT_THRESHOLDS, realEstatePortfolio } from "@/lib/calculos";
import { formatCLP, formatMultiple, formatNumber, formatPct } from "@/lib/formatters";

export const metadata = { title: "Inmobiliario · Family Office OS" };

const TYPE_LABELS: Record<string, string> = {
  STRIP_CENTER: "Strip Center",
  INDUSTRIAL: "Industrial",
  HOSPITALITY: "Hospitality",
  OFICINAS: "Oficinas",
  TERRENO: "Terreno",
  RETAIL: "Retail",
};

export default function InmobiliarioPage() {
  const p = realEstatePortfolio(db);

  const columns: TableColumn[] = [
    { key: "name", header: "Activo" },
    { key: "type", header: "Tipo" },
    { key: "city", header: "Ubicación" },
    { key: "value", header: "Valor", align: "right" },
    { key: "debt", header: "Deuda", align: "right" },
    { key: "equity", header: "Equity", align: "right" },
    { key: "noi", header: "NOI", align: "right", tooltip: "Net Operating Income: ingresos operacionales menos gastos operacionales del activo." },
    { key: "cap", header: "Cap Rate", align: "right", tooltip: "NOI dividido por el valor del activo." },
    { key: "ltv", header: "LTV", align: "right", tooltip: "Loan to Value: deuda sobre valor del activo. Máximo de política 65%." },
    { key: "dscr", header: "DSCR", align: "right", tooltip: "Debt Service Coverage Ratio: NOI sobre servicio de deuda anual. Mínimo de política 1,3x." },
    { key: "occ", header: "Ocupación", align: "right" },
    { key: "share", header: "Participación", align: "right", tooltip: "Participación económica look-through del Family Office en el activo." },
  ];

  const rows = p.rows.map((r) => ({
    id: r.asset.id,
    href: `/inmobiliario/${r.asset.id}`,
    values: [
      r.asset.name,
      TYPE_LABELS[r.asset.realEstateType] ?? r.asset.realEstateType,
      r.asset.city,
      r.value,
      r.debt,
      r.equity,
      r.noi,
      r.capRate,
      r.ltv,
      r.dscr,
      r.asset.occupancy,
      r.familyShare,
    ],
    cells: [
      <span key="n" className="font-medium">{r.asset.name}</span>,
      <span key="t" className="text-muted">{TYPE_LABELS[r.asset.realEstateType]}</span>,
      <span key="c" className="text-muted">{r.asset.city}</span>,
      formatCLP(r.value),
      r.debt > 0 ? formatCLP(r.debt) : "—",
      formatCLP(r.equity),
      r.noi > 0 ? formatCLP(r.noi) : "—",
      r.capRate > 0 ? formatPct(r.capRate) : "—",
      r.debt > 0 ? <ThresholdBadge key="ltv" ok={r.ltv <= ALERT_THRESHOLDS.maxLTV}>{formatPct(r.ltv)}</ThresholdBadge> : "—",
      r.dscr === null ? "—" : <ThresholdBadge key="dscr" ok={r.dscr >= ALERT_THRESHOLDS.minDSCR}>{formatMultiple(r.dscr)}</ThresholdBadge>,
      r.asset.occupancy > 0 ? formatPct(r.asset.occupancy) : "—",
      formatPct(r.familyShare),
    ],
  }));

  return (
    <>
      <PageHeader
        eyebrow="Portafolio"
        title="Inmobiliario"
        subtitle={`¿Cómo están funcionando nuestros activos? ${p.rows.length} activos, ${formatNumber(p.rows.reduce((a, r) => a + r.asset.surfaceM2, 0))} m² totales.`}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
        <MetricCard label="Valor del Portafolio" value={formatCLP(p.totalValue)} hint="100% de los activos" />
        <MetricCard label="Equity Inmobiliario" value={formatCLP(p.economicEquity)} hint="Atribuible al Family Office" />
        <MetricCard label="Deuda Total" value={formatCLP(p.totalDebt)} />
        <MetricCard label="NOI Total" value={formatCLP(p.totalNOI)} tooltip="Net Operating Income anual agregado del portafolio." />
        <MetricCard label="Cap Rate Ponderado" value={formatPct(p.weightedCapRate)} tooltip="NOI total sobre valor de los activos que generan renta." />
        <MetricCard label="LTV Promedio" value={formatPct(p.weightedLTV)} tooltip="Deuda total sobre valor total. Máximo de política 65%." />
        <MetricCard label="Ocupación" value={formatPct(p.weightedOccupancy)} hint="Ponderada por valor" />
      </div>

      <div className="mt-6">
        <DataTable rows={rows} columns={columns} searchPlaceholder="Buscar activo, tipo o ubicación…" initialSort={{ key: "value", dir: "desc" }} />
      </div>
    </>
  );
}
