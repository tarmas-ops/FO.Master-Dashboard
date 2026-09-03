"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface FilterOption {
  value: string;
  label: string;
}

/**
 * Filtros persistentes por vista (consolidado / holding / miembro, y período).
 * El estado vive en el cliente; las cifras del servidor no cambian con el filtro
 * en esta versión, por lo que la selección se muestra explícitamente como vista.
 */
export function SegmentedFilter({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: FilterOption[];
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="inline-flex h-8 items-center gap-0.5 rounded-md border border-border bg-card p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "h-7 rounded-[5px] px-2.5 text-[12px] font-medium transition-colors",
            value === o.value ? "bg-foreground text-white" : "text-muted hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ResumenFilters({ holdings }: { holdings: FilterOption[] }) {
  const [scope, setScope] = React.useState("consolidado");
  const [period, setPeriod] = React.useState("YTD");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <SegmentedFilter
        ariaLabel="Vista del patrimonio"
        options={[{ value: "consolidado", label: "Consolidado" }, ...holdings, { value: "miembro", label: "Por Miembro Familiar" }]}
        value={scope}
        onChange={setScope}
      />
      <SegmentedFilter
        ariaLabel="Período"
        options={[
          { value: "YTD", label: "YTD" },
          { value: "1A", label: "1 Año" },
          { value: "3A", label: "3 Años" },
          { value: "5A", label: "5 Años" },
          { value: "INICIO", label: "Desde Inicio" },
        ]}
        value={period}
        onChange={setPeriod}
      />
    </div>
  );
}
