import { cn } from "@/lib/utils";

/**
 * Aviso de dato ausente en la fuente. Un módulo vacío tiene que explicarse solo:
 * qué falta, por qué falta y qué habría que cargar para que se complete.
 * Nunca se rellena con cifras de ejemplo.
 */
export function DataGapNotice({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-lg border border-dashed border-border bg-card px-5 py-6", className)}>
      <p className="text-[13px] font-medium text-foreground">{title}</p>
      <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-muted">{children}</p>
    </div>
  );
}
