import { MetricCard } from "@/components/dashboard/MetricCard";
import { PortfolioAlertCard } from "@/components/dashboard/PortfolioAlertCard";
import { SimpleBarChart } from "@/components/graficos/SimpleBarChart";
import { PageHeader } from "@/components/navegacion/PageHeader";
import { DataTable, type TableColumn } from "@/components/tablas/DataTable";
import { ThresholdBadge } from "@/components/inversiones/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/data";
import { ALERT_THRESHOLDS, calculateDSCR, calculateNetWorth, calculatePortfolioAlerts, realEstatePortfolio } from "@/lib/calculos";
import { formatCLP, formatDate, formatMultiple, formatPct } from "@/lib/formatters";

export const metadata = { title: "Deuda · Family Office OS" };

export default function DeudaPage() {
  const nw = calculateNetWorth(db);
  const re = realEstatePortfolio(db);
  const totalDebt = db.loans.reduce((a, l) => a + l.balance, 0);
  const weightedRate = totalDebt > 0 ? db.loans.reduce((a, l) => a + l.rate * l.balance, 0) / totalDebt : 0;
  const annualService = db.loans.reduce((a, l) => a + l.annualDebtService, 0);
  const alerts = calculatePortfolioAlerts(db).filter((a) => ["LTV", "DSCR", "VENCIMIENTO_DEUDA", "TASA_VARIABLE"].includes(a.kind));

  const maturityByYear = new Map<string, number>();
  for (const l of db.loans) {
    const y = l.maturityDate.slice(0, 4);
    maturityByYear.set(y, (maturityByYear.get(y) ?? 0) + l.balance);
  }
  const startYear = Number(db.asOf.slice(0, 4));
  const calendar = Array.from({ length: 10 }, (_, i) => {
    const y = String(startYear + i);
    return { label: y, value: maturityByYear.get(y) ?? 0 };
  });

  const columns: TableColumn[] = [
    { key: "name", header: "Crédito" },
    { key: "asset", header: "Activo" },
    { key: "bank", header: "Banco" },
    { key: "balance", header: "Saldo", align: "right" },
    { key: "currency", header: "Moneda" },
    { key: "rate", header: "Tasa", align: "right" },
    { key: "amort", header: "Amortización" },
    { key: "maturity", header: "Vencimiento" },
    { key: "ltv", header: "LTV", align: "right", tooltip: "Loan to Value: saldo del crédito sobre el valor del activo garantizado." },
    { key: "dscr", header: "DSCR", align: "right", tooltip: "Debt Service Coverage Ratio: NOI del activo sobre el servicio de deuda anual." },
  ];

  const rows = db.loans.map((l) => {
    const asset = db.assets.find((a) => a.id === l.assetId);
    const reRow = re.rows.find((r) => r.asset.id === l.assetId);
    const ltv = asset ? l.balance / asset.currentValue : null;
    const dscr = reRow ? calculateDSCR(reRow.noi, l.annualDebtService) : null;
    return {
      id: l.id,
      values: [l.name, asset?.name ?? "—", l.bank, l.balance, l.currency, l.rate, l.amortization, l.maturityDate, ltv, dscr],
      cells: [
        <span key="n" className="font-medium">{l.name}</span>,
        <span key="a" className="text-muted">{asset?.name ?? "—"}</span>,
        <span key="b" className="text-muted">{l.bank}</span>,
        formatCLP(l.balance),
        <span key="c" className="text-muted">{l.currency}</span>,
        <span key="r" className={l.rateType === "VARIABLE" && l.rate >= ALERT_THRESHOLDS.variableRateWarning ? "text-negative" : undefined}>
          {formatPct(l.rate)} {l.rateType === "VARIABLE" ? "var." : "fija"}
        </span>,
        <span key="am" className="text-muted">{l.amortization === "BULLET" ? "Bullet" : l.amortization === "MENSUAL" ? "Mensual" : "Trimestral"}</span>,
        <span key="v" className="text-muted">{formatDate(l.maturityDate)}</span>,
        ltv === null ? "—" : <ThresholdBadge key="ltv" ok={ltv <= ALERT_THRESHOLDS.maxLTV}>{formatPct(ltv)}</ThresholdBadge>,
        dscr === null ? "—" : <ThresholdBadge key="dscr" ok={dscr >= ALERT_THRESHOLDS.minDSCR}>{formatMultiple(dscr)}</ThresholdBadge>,
      ],
    };
  });

  return (
    <>
      <PageHeader
        eyebrow="Family Office"
        title="Deuda"
        subtitle="¿Dónde está nuestro riesgo financiero? Saldos al 100% de cada crédito; el patrimonio neto usa la porción económica."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard label="Deuda Total" value={formatCLP(totalDebt)} hint={`Económica ${formatCLP(nw.totalDebt)}`} />
        <MetricCard label="Tasa Promedio Ponderada" value={formatPct(weightedRate)} />
        <MetricCard label="Servicio de Deuda Anual" value={formatCLP(annualService)} />
        <MetricCard label="LTV Promedio" value={formatPct(re.weightedLTV)} tooltip="Deuda inmobiliaria total sobre valor de los activos." />
        <MetricCard label="Deuda / Patrimonio Neto" value={formatPct(nw.totalDebt / nw.netWorth)} />
      </div>

      <div className="mt-6">
        <DataTable rows={rows} columns={columns} initialSort={{ key: "balance", dir: "desc" }} searchable={false} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Calendario de Vencimientos</CardTitle>
            <span className="text-[12px] text-muted">Próximos 10 años</span>
          </CardHeader>
          <CardContent>
            <SimpleBarChart data={calendar} valueLabel="Saldo que vence" height={240} />
          </CardContent>
        </Card>
        <PortfolioAlertCard alerts={alerts} limit={5} />
      </div>
    </>
  );
}
