import { notFound } from "next/navigation";
import { ActualVsPlanCard } from "@/components/inversiones/ActualVsPlanCard";
import { DocumentList } from "@/components/inversiones/DocumentList";
import { InvestmentThesisCard } from "@/components/inversiones/InvestmentThesisCard";
import { MetricCard, StatRow } from "@/components/dashboard/MetricCard";
import { GroupedBarChart } from "@/components/graficos/GroupedBarChart";
import { PageHeader } from "@/components/navegacion/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/data";
import { calculateAssetEquity, calculateInvestmentPerformanceVsPlan, SECTOR_LABELS } from "@/lib/calculos";
import { formatCLP, formatDate, formatMultiple, formatPct } from "@/lib/formatters";
import type { CompanyInvestment } from "@/types";

const companies = () => db.assets.filter((a): a is CompanyInvestment => a.assetClass === "EMPRESAS_PRIVADAS");

export function generateStaticParams() {
  return companies().map((c) => ({ id: c.id }));
}

export default async function EmpresaPage({ params }: PageProps<"/empresas/[id]">) {
  const { id } = await params;
  const company = companies().find((c) => c.id === id);
  if (!company) notFound();

  const eq = calculateAssetEquity(db, company);
  const thesis = db.theses.find((t) => t.investmentId === company.id);
  const plan = calculateInvestmentPerformanceVsPlan(db, company);
  const documents = db.documents.filter((d) => d.assetId === company.id);
  const ev = company.currentValue + company.netDebt;
  const history = company.history.map((h) => ({ label: String(h.year), Ingresos: h.revenue, EBITDA: h.ebitda }));

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Portafolio" }, { label: "Empresas", href: "/empresas" }, { label: company.name }]}
        eyebrow={SECTOR_LABELS[company.sector]}
        title={company.name}
        subtitle={`${company.subAssetClass} · Participación directa ${formatPct(company.ownershipPercentage)} · Participación económica ${formatPct(eq.familyShare)}`}
        actions={<Badge variant="outline">{company.currency}</Badge>}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Equity Value (100%)" value={formatCLP(company.currentValue)} hint={`Atribuible ${formatCLP(eq.economicValue)}`} />
        <MetricCard label="Enterprise Value" value={formatCLP(ev)} tooltip="Equity value más deuda neta." />
        <MetricCard label="EBITDA" value={formatCLP(company.ebitda)} hint={`Margen ${formatPct(company.ebitda / company.revenue)}`} />
        <MetricCard
          label="Retorno Acumulado"
          value={formatPct(company.currentValue / company.acquisitionCost - 1, { sign: true })}
          hint={`Desde ${formatDate(company.acquisitionDate)}`}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Ingresos y EBITDA Históricos</CardTitle>
          </CardHeader>
          <CardContent>
            <GroupedBarChart data={history} keys={[{ key: "Ingresos", label: "Ingresos" }, { key: "EBITDA", label: "EBITDA" }]} height={260} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Valorización y Participación</CardTitle>
          </CardHeader>
          <CardContent>
            <StatRow label="Ingresos" value={formatCLP(company.revenue)} />
            <StatRow label="EBITDA" value={formatCLP(company.ebitda)} />
            <StatRow label="Margen EBITDA" value={formatPct(company.ebitda / company.revenue)} />
            <StatRow label="Deuda Neta" value={formatCLP(company.netDebt)} />
            <StatRow label="Deuda Neta / EBITDA" value={formatMultiple(company.netDebt / company.ebitda)} />
            <StatRow label="EV / EBITDA" value={formatMultiple(ev / company.ebitda)} />
            <StatRow label="Dividendos 12 Meses (100%)" value={company.dividendsLTM > 0 ? formatCLP(company.dividendsLTM) : "—"} />
            <StatRow label="Dividendos Atribuibles" value={formatCLP(company.dividendsLTM * company.ownershipPercentage)} />
            <StatRow label="Equity Atribuible" value={formatCLP(eq.economicValue)} strong />
            <StatRow label="Método de Valorización" value={company.valuationMethod} muted />
          </CardContent>
        </Card>
      </div>

      {plan ? (
        <div className="mt-4">
          <ActualVsPlanCard plan={plan} />
        </div>
      ) : null}

      {thesis ? (
        <div className="mt-4">
          <InvestmentThesisCard thesis={thesis} />
        </div>
      ) : null}

      <div className="mt-4">
        <DocumentList documents={documents} />
      </div>
    </>
  );
}
