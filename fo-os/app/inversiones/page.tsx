import { MetricCard } from "@/components/dashboard/MetricCard";
import { PageHeader } from "@/components/navegacion/PageHeader";
import { DataTable, type TableColumn } from "@/components/tablas/DataTable";
import { db } from "@/data";
import { allAssetEquities, ASSET_CLASS_LABELS, calculateNetWorth, COUNTRY_LABELS } from "@/lib/calculos";
import { formatCLP, formatOr, formatPct } from "@/lib/formatters";

export const metadata = { title: "Inversiones · Family Office OS" };

export default function InversionesPage() {
  const equities = allAssetEquities(db).sort((a, b) => b.economicValue - a.economicValue);
  const nw = calculateNetWorth(db);
  // Solo se agrega el costo de los activos que lo registran; el resto no distorsiona el total.
  const withCost = equities.filter((e) => e.asset.acquisitionCost !== undefined);
  const invested = withCost.length === 0 ? null : withCost.reduce((a, e) => a + (e.asset.acquisitionCost ?? 0) * e.familyShare, 0);
  const costValue = withCost.reduce((a, e) => a + e.economicValue, 0);
  const gain = invested === null ? null : costValue - invested;

  const columns: TableColumn[] = [
    { key: "name", header: "Inversión" },
    { key: "class", header: "Clase" },
    { key: "country", header: "País" },
    { key: "currency", header: "Moneda" },
    { key: "value", header: "Valor (100%)", align: "right" },
    { key: "share", header: "Participación", align: "right", tooltip: "Participación económica look-through del Family Office." },
    { key: "economic", header: "Valor Económico", align: "right" },
    { key: "debt", header: "Deuda", align: "right" },
    { key: "equity", header: "Equity Atribuible", align: "right" },
    { key: "weight", header: "% Patrimonio", align: "right" },
    { key: "ret", header: "Retorno Acum.", align: "right" },
  ];

  const rows = equities.map((e) => {
    const ret = e.asset.acquisitionCost !== undefined && e.asset.acquisitionCost > 0 ? e.asset.currentValue / e.asset.acquisitionCost - 1 : null;
    const href =
      e.asset.assetClass === "INMOBILIARIO"
        ? `/inmobiliario/${e.asset.id}`
        : e.asset.assetClass === "EMPRESAS_PRIVADAS"
          ? `/empresas/${e.asset.id}`
          : undefined;
    return {
      id: e.asset.id,
      href,
      values: [
        e.asset.name,
        ASSET_CLASS_LABELS[e.asset.assetClass],
        COUNTRY_LABELS[e.asset.country],
        e.asset.currency,
        e.grossValue,
        e.familyShare,
        e.economicValue,
        e.grossDebt,
        e.attributableEquity,
        nw.netWorth > 0 ? e.attributableEquity / nw.netWorth : 0,
        ret,
      ],
      cells: [
        <span key="n" className="font-medium">{e.asset.name}</span>,
        <span key="c" className="text-muted">{ASSET_CLASS_LABELS[e.asset.assetClass]}</span>,
        <span key="p" className="text-muted">{COUNTRY_LABELS[e.asset.country]}</span>,
        <span key="m" className="text-muted">{e.asset.currency}</span>,
        formatCLP(e.grossValue),
        formatPct(e.familyShare),
        formatCLP(e.economicValue),
        e.grossDebt > 0 ? formatCLP(e.grossDebt) : "—",
        formatCLP(e.attributableEquity),
        formatPct(nw.netWorth > 0 ? e.attributableEquity / nw.netWorth : 0),
        ret === null ? "s/d" : <span key="r" className={ret >= 0 ? "text-positive" : "text-negative"}>{formatPct(ret, { sign: true })}</span>,
      ],
    };
  });

  return (
    <>
      <PageHeader
        eyebrow="Portafolio"
        title="Inversiones"
        subtitle="¿Qué tenemos y cuánto vale? Vista consolidada de todos los activos en base económica look-through."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Activos Totales" value={formatCLP(nw.totalAssets)} hint={`${equities.length} posiciones`} />
        <MetricCard
          label="Capital Invertido"
          value={formatOr(invested, (v) => formatCLP(v))}
          hint={
            withCost.length === equities.length
              ? "Costo de adquisición económico"
              : `${withCost.length} de ${equities.length} posiciones con costo registrado`
          }
        />
        <MetricCard
          label="Ganancia No Realizada"
          value={formatOr(gain, (v) => formatCLP(v, { sign: true }))}
          delta={invested !== null && gain !== null && invested > 0 ? gain / invested : null}
        />
        <MetricCard label="Patrimonio Neto" value={formatCLP(nw.netWorth)} hint={`Deuda ${formatCLP(nw.totalDebt)}`} />
      </div>

      <div className="mt-6">
        <DataTable rows={rows} columns={columns} searchPlaceholder="Buscar inversión, clase o país…" initialSort={{ key: "economic", dir: "desc" }} />
      </div>
    </>
  );
}
