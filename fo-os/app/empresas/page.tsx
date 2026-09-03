import { MetricCard } from "@/components/dashboard/MetricCard";
import { PageHeader } from "@/components/navegacion/PageHeader";
import { DataTable, type TableColumn } from "@/components/tablas/DataTable";
import { db } from "@/data";
import { calculateAssetEquity, SECTOR_LABELS } from "@/lib/calculos";
import { formatCLP, formatMultiple, formatPct } from "@/lib/formatters";
import type { CompanyInvestment } from "@/types";

export const metadata = { title: "Empresas · Family Office OS" };

export default function EmpresasPage() {
  const companies = db.assets.filter((a): a is CompanyInvestment => a.assetClass === "EMPRESAS_PRIVADAS");
  const economic = companies.reduce((a, c) => a + calculateAssetEquity(db, c).economicValue, 0);
  const ebitda = companies.reduce((a, c) => a + c.ebitda * c.ownershipPercentage, 0);
  const dividends = companies.reduce((a, c) => a + c.dividendsLTM * c.ownershipPercentage, 0);

  const columns: TableColumn[] = [
    { key: "name", header: "Empresa" },
    { key: "sector", header: "Sector" },
    { key: "share", header: "Participación", align: "right" },
    { key: "ev", header: "Enterprise Value", align: "right", tooltip: "Equity value más deuda neta: valor total de la empresa." },
    { key: "equity", header: "Equity Value", align: "right" },
    { key: "revenue", header: "Ingresos", align: "right" },
    { key: "ebitda", header: "EBITDA", align: "right" },
    { key: "margin", header: "Margen", align: "right" },
    { key: "netDebt", header: "Deuda Neta", align: "right" },
    { key: "dividends", header: "Dividendos 12M", align: "right" },
  ];

  const rows = companies.map((c) => {
    const ev = c.currentValue + c.netDebt;
    return {
      id: c.id,
      href: `/empresas/${c.id}`,
      values: [c.name, SECTOR_LABELS[c.sector], c.ownershipPercentage, ev, c.currentValue, c.revenue, c.ebitda, c.ebitda / c.revenue, c.netDebt, c.dividendsLTM],
      cells: [
        <span key="n" className="font-medium">{c.name}</span>,
        <span key="s" className="text-muted">{SECTOR_LABELS[c.sector]}</span>,
        formatPct(c.ownershipPercentage),
        formatCLP(ev),
        formatCLP(c.currentValue),
        formatCLP(c.revenue),
        formatCLP(c.ebitda),
        formatPct(c.ebitda / c.revenue),
        formatCLP(c.netDebt),
        c.dividendsLTM > 0 ? formatCLP(c.dividendsLTM) : "—",
      ],
    };
  });

  return (
    <>
      <PageHeader
        eyebrow="Portafolio"
        title="Empresas"
        subtitle="¿Cómo están evolucionando nuestras participaciones privadas? Valores 100% de cada empresa; la columna de participación indica cuánto nos corresponde."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Equity Value Atribuible" value={formatCLP(economic)} hint={`${companies.length} empresas`} />
        <MetricCard label="EBITDA Atribuible" value={formatCLP(ebitda)} tooltip="EBITDA de cada empresa ponderado por nuestra participación directa." />
        <MetricCard label="Dividendos 12 Meses" value={formatCLP(dividends)} hint="Atribuibles a nuestra participación" />
        <MetricCard label="Múltiplo Implícito" value={formatMultiple(ebitda > 0 ? economic / ebitda : 0)} hint="Equity atribuible / EBITDA atribuible" />
      </div>

      <div className="mt-6">
        <DataTable rows={rows} columns={columns} searchPlaceholder="Buscar empresa o sector…" initialSort={{ key: "equity", dir: "desc" }} searchable={false} />
      </div>
    </>
  );
}
