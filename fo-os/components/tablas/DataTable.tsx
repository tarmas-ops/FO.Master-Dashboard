"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export interface TableColumn {
  key: string;
  header: string;
  align?: "left" | "right";
  className?: string;
  tooltip?: string;
}

/**
 * Fila serializable: las celdas llegan ya renderizadas desde el Server Component y
 * `values` (alineado con las columnas) es lo que se usa para ordenar y buscar. Así
 * los datos y el motor financiero se quedan en el servidor y el cliente solo maneja
 * la interacción.
 */
export interface TableRowData {
  id: string;
  href?: string;
  cells: React.ReactNode[];
  values: Array<string | number | null>;
}

export function DataTable({
  columns,
  rows,
  searchPlaceholder = "Buscar…",
  initialSort,
  emptyMessage = "Sin resultados.",
  toolbar,
  searchable,
}: {
  columns: TableColumn[];
  rows: TableRowData[];
  searchPlaceholder?: string;
  initialSort?: { key: string; dir: "asc" | "desc" };
  emptyMessage?: string;
  toolbar?: React.ReactNode;
  searchable?: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState<{ key: string; dir: "asc" | "desc" } | null>(initialSort ?? null);
  const showSearch = searchable ?? rows.length > 6;

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.values.some((v) => String(v ?? "").toLowerCase().includes(q)));
  }, [rows, query]);

  const sorted = React.useMemo(() => {
    if (!sort) return filtered;
    const idx = columns.findIndex((c) => c.key === sort.key);
    if (idx < 0) return filtered;
    return [...filtered].sort((a, b) => {
      const va = a.values[idx];
      const vb = b.values[idx];
      if (va === null || va === undefined) return 1;
      if (vb === null || vb === undefined) return -1;
      const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "es");
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sort, columns]);

  const toggleSort = (key: string) => setSort((s) => (s?.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));

  return (
    <div>
      {(toolbar || showSearch) && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {showSearch ? (
            <div className="relative max-w-xs flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-2" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={searchPlaceholder} className="pl-8" aria-label={searchPlaceholder} />
            </div>
          ) : null}
          {toolbar}
        </div>
      )}
      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {columns.map((c) => {
                const active = sort?.key === c.key;
                return (
                  <TableHead key={c.key} className={cn(c.align === "right" && "text-right", c.className)} title={c.tooltip}>
                    <button
                      type="button"
                      onClick={() => toggleSort(c.key)}
                      className={cn("inline-flex items-center gap-1 hover:text-foreground", c.align === "right" && "flex-row-reverse")}
                    >
                      {c.header}
                      {active ? sort.dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" /> : null}
                    </button>
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns.length} className="py-10 text-center text-muted">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              sorted.map((row) => (
                <TableRow key={row.id} onClick={row.href ? () => router.push(row.href!) : undefined} className={cn(row.href && "cursor-pointer")}>
                  {row.cells.map((cell, i) => (
                    <TableCell key={columns[i]?.key ?? i} className={cn(columns[i]?.align === "right" && "text-right", columns[i]?.className)}>
                      {cell}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
