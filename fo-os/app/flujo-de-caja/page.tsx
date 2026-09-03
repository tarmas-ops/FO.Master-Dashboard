import { CashFlowBreakdown } from "@/components/dashboard/CashFlowBreakdown";
import { InvestmentFirepowerCard } from "@/components/dashboard/InvestmentFirepowerCard";
import { LiquidityForecast } from "@/components/dashboard/LiquidityForecast";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { CashFlowChart } from "@/components/graficos/CashFlowChart";
import { PageHeader } from "@/components/navegacion/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { db } from "@/data";
import { calculateCashFlow, calculateInvestmentFirepower, calculateLiquidityCoverage, forwardMonths, trailingMonths } from "@/lib/calculos";
import { formatCLP, formatMonth } from "@/lib/formatters";

export const metadata = { title: "Flujo de Caja · Family Office OS" };

export default function FlujoDeCajaPage() {
  const hist = trailingMonths(db.asOf, 24);
  const proj = forwardMonths(db.asOf, 24);
  const historical = calculateCashFlow(db, hist.from, hist.to, true);
  const projected = calculateCashFlow(db, proj.from, proj.to, false);
  const ltm = trailingMonths(db.asOf, 12);
  const last12 = calculateCashFlow(db, ltm.from, ltm.to, true);
  const coverages = [3, 6, 12, 24].map((h) => calculateLiquidityCoverage(db, h));
  const fp = calculateInvestmentFirepower(db);

  return (
    <>
      <PageHeader
        eyebrow="Análisis"
        title="Flujo de Caja"
        subtitle="¿Cuánto dinero estamos generando y utilizando? Todos los montos están ponderados por la participación económica en cada entidad."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Ingresos 12 Meses" value={formatCLP(last12.income)} />
        <MetricCard label="Egresos 12 Meses" value={formatCLP(last12.expenses)} />
        <MetricCard label="Flujo Neto 12 Meses" value={formatCLP(last12.net, { sign: true })} />
        <MetricCard label="Flujo Proyectado 24 Meses" value={formatCLP(projected.net, { sign: true })} hint="Compromisos ya conocidos" />
      </div>

      <div className="mt-6">
        <Tabs defaultValue="historico">
          <TabsList>
            <TabsTrigger value="historico">Histórico</TabsTrigger>
            <TabsTrigger value="proyectado">Proyectado</TabsTrigger>
          </TabsList>

          <TabsContent value="historico">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Entradas, Salidas y Flujo Neto</CardTitle>
                  <p className="mt-1 text-[13px] text-muted">
                    Últimos 24 meses · {formatMonth(hist.from)} a {formatMonth(hist.to)}
                  </p>
                </div>
                <span className={`tnum text-[15px] font-semibold ${historical.net >= 0 ? "text-positive" : "text-negative"}`}>
                  {formatCLP(historical.net, { sign: true })}
                </span>
              </CardHeader>
              <CardContent>
                <CashFlowChart data={historical.months} height={300} />
              </CardContent>
            </Card>
            <Card className="mt-4">
              <CardHeader>
                <CardTitle>Detalle por Concepto</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <CashFlowBreakdown cf={historical} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="proyectado">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Proyección de Entradas y Salidas</CardTitle>
                  <p className="mt-1 text-[13px] text-muted">
                    Próximos 24 meses · {formatMonth(proj.from)} a {formatMonth(proj.to)}
                  </p>
                </div>
                <span className={`tnum text-[15px] font-semibold ${projected.net >= 0 ? "text-positive" : "text-negative"}`}>
                  {formatCLP(projected.net, { sign: true })}
                </span>
              </CardHeader>
              <CardContent>
                <CashFlowChart data={projected.months} height={300} />
              </CardContent>
            </Card>
            <Card className="mt-4">
              <CardHeader>
                <CardTitle>Detalle por Concepto</CardTitle>
                <span className="text-[12px] text-muted">Incluye capital calls, CAPEX y vencimientos comprometidos</span>
              </CardHeader>
              <CardContent className="pt-0">
                <CashFlowBreakdown cf={projected} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <LiquidityForecast coverages={coverages} />
        <InvestmentFirepowerCard fp={fp} />
      </div>
    </>
  );
}
