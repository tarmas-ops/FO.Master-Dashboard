import { MetricCard } from "@/components/dashboard/MetricCard";
import { PageHeader } from "@/components/navegacion/PageHeader";
import { DataTable, type TableColumn } from "@/components/tablas/DataTable";
import { db } from "@/data";
import { formatCLP, formatNumber, formatPct } from "@/lib/formatters";
import type { PublicSecurity } from "@/types";

export const metadata = { title: "Mercados Públicos · Family Office OS" };

export default function MercadosPublicosPage() {
  const securities = db.assets.filter((a): a is PublicSecurity => a.assetClass === "MERCADOS_PUBLICOS" || a.assetClass === "RENTA_FIJA");
  const marketValue = securities.reduce((a, s) => a + s.currentValue, 0);
  const cost = securities.reduce((a, s) => a + s.acquisitionCost, 0);
  const dividends = securities.reduce((a, s) => a + s.dividendsLTM, 0);

  const columns: TableColumn[] = [
    { key: "ticker", header: "Ticker" },
    { key: "issuer", header: "Emisor" },
    { key: "class", header: "Clase" },
    { key: "shares", header: "Cantidad", align: "right" },
    { key: "price", header: "Precio", align: "right" },
    { key: "value", header: "Valor de Mercado", align: "right" },
    { key: "cost", header: "Costo", align: "right" },
    { key: "gain", header: "Ganancia", align: "right" },
    { key: "weight", header: "Peso en Cartera", align: "right" },
    { key: "yield", header: "Dividend Yield", align: "right", tooltip: "Dividendos de los últimos 12 meses sobre el valor de mercado." },
  ];

  const rows = securities.map((s) => {
    const gain = s.acquisitionCost > 0 ? s.currentValue / s.acquisitionCost - 1 : 0;
    return {
      id: s.id,
      values: [s.ticker, s.issuer, s.assetClass === "RENTA_FIJA" ? "Renta Fija" : "Acciones", s.shares, s.price, s.currentValue, s.acquisitionCost, gain, s.currentValue / marketValue, s.dividendYield],
      cells: [
        <span key="t" className="font-medium">{s.ticker}</span>,
        <span key="i" className="text-muted">{s.issuer}</span>,
        <span key="c" className="text-muted">{s.assetClass === "RENTA_FIJA" ? "Renta Fija" : "Acciones"}</span>,
        formatNumber(s.shares),
        s.currency === "USD" ? `US$ ${formatNumber(s.price, 2)}` : formatNumber(s.price, s.price < 1000 ? 1 : 0),
        formatCLP(s.currentValue),
        formatCLP(s.acquisitionCost),
        <span key="g" className={gain >= 0 ? "text-positive" : "text-negative"}>{formatPct(gain, { sign: true })}</span>,
        formatPct(s.currentValue / marketValue),
        formatPct(s.dividendYield),
      ],
    };
  });

  return (
    <>
      <PageHeader
        eyebrow="Portafolio"
        title="Mercados Públicos"
        subtitle="¿Cómo está la cartera líquida? Precios de referencia; sin conexión a feeds de mercado en esta versión."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard label="Valor de Mercado" value={formatCLP(marketValue)} hint={`${securities.length} posiciones`} />
        <MetricCard label="Costo" value={formatCLP(cost)} />
        <MetricCard label="Ganancia No Realizada" value={formatCLP(marketValue - cost, { sign: true })} delta={cost > 0 ? marketValue / cost - 1 : null} />
        <MetricCard label="Dividendos 12 Meses" value={formatCLP(dividends)} />
        <MetricCard label="Yield de la Cartera" value={formatPct(marketValue > 0 ? dividends / marketValue : 0)} />
      </div>

      <div className="mt-6">
        <DataTable rows={rows} columns={columns} searchPlaceholder="Buscar ticker o emisor…" initialSort={{ key: "value", dir: "desc" }} />
      </div>
    </>
  );
}
