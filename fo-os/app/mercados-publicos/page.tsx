import { MetricCard } from "@/components/dashboard/MetricCard";
import { PageHeader } from "@/components/navegacion/PageHeader";
import { DataTable, type TableColumn } from "@/components/tablas/DataTable";
import { db } from "@/data";
import { formatCLP, formatNumber, formatOr, formatPct } from "@/lib/formatters";
import type { PublicSecurity } from "@/types";

export const metadata = { title: "Mercados Públicos · Family Office OS" };

export default function MercadosPublicosPage() {
  const securities = db.assets.filter((a): a is PublicSecurity => a.assetClass === "MERCADOS_PUBLICOS" || a.assetClass === "RENTA_FIJA");
  const marketValue = securities.reduce((a, s) => a + s.currentValue, 0);
  // Costo y dividendos solo se agregan sobre las posiciones que los declaran.
  const withCost = securities.filter((s) => s.acquisitionCost !== undefined);
  const withDividends = securities.filter((s) => s.dividendsLTM !== undefined);
  const cost = withCost.length === 0 ? null : withCost.reduce((a, s) => a + (s.acquisitionCost ?? 0), 0);
  const costValue = withCost.reduce((a, s) => a + s.currentValue, 0);
  const dividends = withDividends.length === 0 ? null : withDividends.reduce((a, s) => a + (s.dividendsLTM ?? 0), 0);

  const costHint = withCost.length === securities.length ? undefined : `${withCost.length} de ${securities.length} posiciones con costo`;
  const dividendHint =
    withDividends.length === securities.length ? undefined : `${withDividends.length} de ${securities.length} posiciones con dividendos`;

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
    const gain = s.acquisitionCost !== undefined && s.acquisitionCost > 0 ? s.currentValue / s.acquisitionCost - 1 : null;
    return {
      id: s.id,
      values: [
        s.ticker,
        s.issuer,
        s.assetClass === "RENTA_FIJA" ? "Renta Fija" : "Acciones",
        s.shares ?? null,
        s.price ?? null,
        s.currentValue,
        s.acquisitionCost ?? null,
        gain,
        marketValue > 0 ? s.currentValue / marketValue : null,
        s.dividendYield ?? null,
      ],
      cells: [
        <span key="t" className="font-medium">{s.ticker}</span>,
        <span key="i" className="text-muted">{s.issuer}</span>,
        <span key="c" className="text-muted">{s.assetClass === "RENTA_FIJA" ? "Renta Fija" : "Acciones"}</span>,
        formatOr(s.shares, (v) => formatNumber(v)),
        formatOr(s.price, (v) => (s.currency === "USD" ? `US$ ${formatNumber(v, 2)}` : formatNumber(v, v < 1000 ? 1 : 0))),
        formatCLP(s.currentValue),
        formatOr(s.acquisitionCost, (v) => formatCLP(v)),
        gain === null ? "s/d" : <span key="g" className={gain >= 0 ? "text-positive" : "text-negative"}>{formatPct(gain, { sign: true })}</span>,
        formatOr(marketValue > 0 ? s.currentValue / marketValue : null, formatPct),
        formatOr(s.dividendYield, formatPct),
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
        <MetricCard label="Costo" value={formatOr(cost, (v) => formatCLP(v))} hint={costHint} />
        <MetricCard
          label="Ganancia No Realizada"
          value={formatOr(cost, (v) => formatCLP(costValue - v, { sign: true }))}
          delta={cost !== null && cost > 0 ? costValue / cost - 1 : null}
        />
        <MetricCard label="Dividendos 12 Meses" value={formatOr(dividends, (v) => formatCLP(v))} hint={dividendHint} />
        <MetricCard
          label="Yield de la Cartera"
          value={formatOr(dividends !== null && marketValue > 0 ? dividends / marketValue : null, formatPct)}
        />
      </div>

      <div className="mt-6">
        <DataTable rows={rows} columns={columns} searchPlaceholder="Buscar ticker o emisor…" initialSort={{ key: "value", dir: "desc" }} />
      </div>
    </>
  );
}
