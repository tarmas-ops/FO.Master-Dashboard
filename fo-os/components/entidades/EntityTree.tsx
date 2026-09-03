"use client";

import * as React from "react";
import Link from "next/link";
import { Building2, ChevronRight, GitBranch, Landmark, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { StatRow } from "@/components/dashboard/MetricCard";
import { cn } from "@/lib/utils";
import { formatCLP, formatPct } from "@/lib/formatters";
import type { TreeNode } from "@/lib/calculos";

const ENTITY_TYPE_LABELS: Record<string, string> = {
  FAMILY_OFFICE: "Family Office",
  HOLDING: "Holding",
  SPV: "SPV",
  OPERATING_COMPANY: "Sociedad Operativa",
  FUND: "Fondo",
  PERSON: "Persona",
};

function NodeIcon({ node }: { node: TreeNode }) {
  if (node.kind === "ACTIVO") return <Building2 className="size-3.5 text-muted-2" strokeWidth={1.75} />;
  if (node.type === "FAMILY_OFFICE") return <Users className="size-3.5 text-foreground" strokeWidth={1.75} />;
  if (node.type === "SPV") return <Landmark className="size-3.5 text-muted-2" strokeWidth={1.75} />;
  return <GitBranch className="size-3.5 text-muted-2" strokeWidth={1.75} />;
}

function TreeRow({ node, depth, onSelect }: { node: TreeNode; depth: number; onSelect: (n: TreeNode) => void }) {
  const [open, setOpen] = React.useState(depth < 2);
  const hasChildren = node.children.length > 0;
  return (
    <li>
      <div
        className="group flex items-center gap-2 rounded-md py-1.5 pr-2 hover:bg-hover"
        style={{ paddingLeft: depth * 20 + 8 }}
      >
        {hasChildren ? (
          <button type="button" onClick={() => setOpen((o) => !o)} aria-label={open ? "Contraer" : "Expandir"} className="text-muted-2 hover:text-foreground">
            <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
          </button>
        ) : (
          <span className="w-3.5" />
        )}
        <NodeIcon node={node} />
        <button type="button" onClick={() => onSelect(node)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <span className={cn("truncate text-[13px]", node.kind === "ENTIDAD" ? "font-medium text-foreground" : "text-foreground")}>{node.name}</span>
          <span className="hidden text-[11px] text-muted-2 sm:inline">{node.kind === "ENTIDAD" ? ENTITY_TYPE_LABELS[node.type] ?? node.type : node.type}</span>
        </button>
        <span className="tnum hidden w-16 text-right text-[12px] text-muted sm:inline" title="Participación directa del padre">
          {formatPct(node.directShare, { decimals: 0 })}
        </span>
        <span className="tnum w-16 text-right text-[12px] font-medium text-foreground" title="Participación económica look-through">
          {formatPct(node.economicShare)}
        </span>
        <span className="tnum hidden w-24 text-right text-[12px] text-muted md:inline" title="Equity atribuible al Family Office">
          {formatCLP(node.attributableEquity)}
        </span>
      </div>
      {hasChildren && open ? (
        <ul className="relative">
          <span className="absolute inset-y-0 border-l border-border" style={{ left: depth * 20 + 15 }} aria-hidden />
          {node.children.map((c) => (
            <TreeRow key={c.id} node={c} depth={depth + 1} onSelect={onSelect} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function EntityTree({ root }: { root: TreeNode }) {
  const [selected, setSelected] = React.useState<TreeNode | null>(null);
  return (
    <>
      <div className="rounded-lg border border-border bg-card p-2">
        <div className="flex items-center gap-2 border-b border-border px-2 pb-2 pr-2 text-[11px] font-medium uppercase tracking-wider text-muted-2">
          <span className="flex-1">Entidad / Activo</span>
          <span className="hidden w-16 text-right sm:inline">Directa</span>
          <span className="w-16 text-right">Económica</span>
          <span className="hidden w-24 text-right md:inline">Equity Atribuible</span>
        </div>
        <ul className="pt-1">
          <TreeRow node={root} depth={0} onSelect={setSelected} />
        </ul>
      </div>

      <Sheet open={selected !== null} onOpenChange={(o) => !o && setSelected(null)}>
        {selected ? (
          <SheetContent
            title={selected.name}
            description={selected.kind === "ENTIDAD" ? ENTITY_TYPE_LABELS[selected.type] ?? selected.type : selected.type}
          >
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{selected.kind === "ENTIDAD" ? "Entidad" : "Activo"}</Badge>
              {selected.country ? <Badge variant="outline">{selected.country === "CL" ? "Chile" : selected.country === "US" ? "Estados Unidos" : "Global"}</Badge> : null}
              {selected.currency ? <Badge variant="outline">{selected.currency}</Badge> : null}
            </div>
            <div className="mt-4">
              <StatRow label="Participación Directa" value={formatPct(selected.directShare)} />
              <StatRow label="Participación Económica (look-through)" value={formatPct(selected.economicShare)} />
              <StatRow label="Equity Atribuible al Family Office" value={formatCLP(selected.attributableEquity)} strong />
            </div>
            {selected.children.length > 0 ? (
              <div className="mt-5">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted">Contiene</p>
                <ul className="mt-2 divide-y divide-border">
                  {selected.children.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-3 py-2 text-[13px]">
                      <span className="truncate text-foreground">{c.name}</span>
                      <span className="flex shrink-0 items-center gap-3">
                        <span className="tnum text-muted">{formatPct(c.economicShare)}</span>
                        <span className="tnum font-medium">{formatCLP(c.attributableEquity)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {selected.href ? (
              <Link href={selected.href} className="mt-5 inline-flex items-center gap-1 text-[13px] font-medium text-foreground hover:underline">
                Ver detalle del activo <ChevronRight className="size-3.5" />
              </Link>
            ) : null}
          </SheetContent>
        ) : null}
      </Sheet>
    </>
  );
}
