import Link from "next/link";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AlertSeverity, PortfolioAlert } from "@/lib/calculos";

const SEVERITY_VARIANT: Record<AlertSeverity, "negative" | "warning" | "neutral"> = {
  CRITICA: "negative",
  ALTA: "warning",
  MEDIA: "neutral",
};

const SEVERITY_LABEL: Record<AlertSeverity, string> = { CRITICA: "Crítica", ALTA: "Alta", MEDIA: "Media" };

export function PortfolioAlertCard({ alerts, limit = 5 }: { alerts: PortfolioAlert[]; limit?: number }) {
  const shown = alerts.slice(0, limit);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Alertas del Portafolio</CardTitle>
        {alerts.length > limit ? <span className="text-[12px] text-muted">{alerts.length} en total</span> : null}
      </CardHeader>
      <CardContent className="pt-0">
        {shown.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-muted">Sin alertas activas.</p>
        ) : (
          <ul className="divide-y divide-border">
            {shown.map((a) => {
              const body = (
                <div className="flex items-start gap-3 py-3">
                  <AlertTriangle className={`mt-0.5 size-4 shrink-0 ${a.severity === "CRITICA" ? "text-negative" : a.severity === "ALTA" ? "text-warning" : "text-muted-2"}`} strokeWidth={1.75} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[13px] font-medium text-foreground">{a.title}</p>
                      <Badge variant={SEVERITY_VARIANT[a.severity]}>{SEVERITY_LABEL[a.severity]}</Badge>
                    </div>
                    <p className="mt-0.5 text-[12px] leading-relaxed text-muted">{a.detail}</p>
                  </div>
                  {a.href ? <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-2" /> : null}
                </div>
              );
              return (
                <li key={a.id}>
                  {a.href ? (
                    <Link href={a.href} className="block -mx-2 rounded-md px-2 hover:bg-hover">
                      {body}
                    </Link>
                  ) : (
                    body
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
