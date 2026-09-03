import { MetricCard } from "@/components/dashboard/MetricCard";
import { PageHeader } from "@/components/navegacion/PageHeader";
import { DataTable, type TableColumn } from "@/components/tablas/DataTable";
import { db } from "@/data";
import { calculateAssetEquity, SECTOR_LABELS } from "@/lib/calculos";
import { formatCLP, formatMultiple, formatOr, formatPct } from "@/lib/formatters";
import type { CompanyInvestment } from "@/types";

export const metadata = { title: "Empresas · Family Office OS" };

export default function EmpresasPage() {
  const companies = db.assets.filter((a): a is CompanyInvestment => a.assetClass === "EMPRESAS_PRIVADAS");
  const economic = companies.reduce((a, c) => a + calculateAssetEquity(db, c).economicValue, 0);
  // Los agregados operacionales se computan solo sobre las empresas que reportan la cifra.
  // Si ninguna la reporta el indicador queda en "s/d", nunca en cero.
  const withEbitda = companies.filter((c) => c.ebitda !== undefined);
  const withDividends = companies.filter((c) => c.dividendsLTM !== undefined);
  const ebitda = withEbitda.length === 0 ? null : withEbitda.reduce((a, c) => a + (c.ebitda ?? 0) * c.ownershipPercentage, 0);
  const dividends = withDividends.length === 0 ? null : withDividends.reduce((a, c) => a + (c.dividendsLTM ?? 0) * c.ownershipPercentage, 0);
  const multiple = ebitda !== null && ebitda > 0 ? economic / ebitda : null;
  const coverageHint = (n: number) => (n === companies.length ? undefined : `${n} de ${companies.length} empresas reportan`);

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
    // Sin deuda neta informada no hay enterprise value: el equity value por sí solo no lo es.
    const ev = c.netDebt === undefined ? null : c.currentValue + c.netDebt;
    const margin = c.ebitda !== undefined && c.revenue !== undefined && c.revenue > 0 ? c.ebitda / c.revenue : null;
    return {
      id: c.id,
      href: `/empresas/${c.id}`,
      values: [
        c.name,
        SECTOR_LABELS[c.sector],
        c.ownershipPercentage,
        ev,
        c.currentValue,
        c.revenue ?? null,
        c.ebitda ?? null,
        margin,
        c.netDebt ?? null,
        c.dividendsLTM ?? null,
      ],
      cells: [
        <span key="n" className="font-medium">{c.name}</span>,
        <span key="s" className="text-muted">{SECTOR_LABELS[c.sector]}</span>,
        formatPct(c.ownershipPercentage),
        formatOr(ev, (v) => formatCLP(v)),
        formatCLP(c.currentValue),
        formatOr(c.revenue, (v) => formatCLP(v)),
        formatOr(c.ebitda, (v) => formatCLP(v)),
        formatOr(margin, formatPct),
        formatOr(c.netDebt, (v) => formatCLP(v)),
        formatOr(c.dividendsLTM, (v) => formatCLP(v)),
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
        <MetricCard
          label="EBITDA Atribuible"
          value={formatOr(ebitda, (v) => formatCLP(v))}
          hint={coverageHint(withEbitda.length)}
          tooltip="EBITDA de cada empresa ponderado por nuestra participación directa."
        />
        <MetricCard
          label="Dividendos 12 Meses"
          value={formatOr(dividends, (v) => formatCLP(v))}
          hint={coverageHint(withDividends.length) ?? "Atribuibles a nuestra participación"}
        />
        <MetricCard label="Múltiplo Implícito" value={formatOr(multiple, (v) => formatMultiple(v))} hint="Equity atribuible / EBITDA atribuible" />
      </div>

      <div className="mt-6">
        <DataTable rows={rows} columns={columns} searchPlaceholder="Buscar empresa o sector…" initialSort={{ key: "equity", dir: "desc" }} searchable={false} />
      </div>
    </>
  );
}
