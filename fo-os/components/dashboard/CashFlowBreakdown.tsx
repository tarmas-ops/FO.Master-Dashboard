import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CATEGORY_LABELS, EXPENSE_CATEGORIES, INCOME_CATEGORIES, type CashFlowWindow } from "@/lib/calculos";
import { formatCLP, formatPct } from "@/lib/formatters";

export function CashFlowBreakdown({ cf }: { cf: CashFlowWindow }) {
  const incomeRows = INCOME_CATEGORIES.filter((c) => cf.byCategory[c] !== 0);
  const expenseRows = EXPENSE_CATEGORIES.filter((c) => cf.byCategory[c] !== 0);
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Concepto</TableHead>
          <TableHead className="text-right">Monto</TableHead>
          <TableHead className="text-right">% del Total</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={3} className="bg-hover text-[11px] font-medium uppercase tracking-wider text-muted">
            Ingresos
          </TableCell>
        </TableRow>
        {incomeRows.map((c) => (
          <TableRow key={c}>
            <TableCell>{CATEGORY_LABELS[c]}</TableCell>
            <TableCell className="text-right">{formatCLP(cf.byCategory[c])}</TableCell>
            <TableCell className="text-right text-muted">{cf.income > 0 ? formatPct(cf.byCategory[c] / cf.income) : "—"}</TableCell>
          </TableRow>
        ))}
        <TableRow className="hover:bg-transparent">
          <TableCell className="font-medium">Total Ingresos</TableCell>
          <TableCell className="text-right font-semibold">{formatCLP(cf.income)}</TableCell>
          <TableCell />
        </TableRow>

        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={3} className="bg-hover text-[11px] font-medium uppercase tracking-wider text-muted">
            Egresos
          </TableCell>
        </TableRow>
        {expenseRows.map((c) => (
          <TableRow key={c}>
            <TableCell>{CATEGORY_LABELS[c]}</TableCell>
            <TableCell className="text-right">{formatCLP(cf.byCategory[c])}</TableCell>
            <TableCell className="text-right text-muted">{cf.expenses > 0 ? formatPct(cf.byCategory[c] / cf.expenses) : "—"}</TableCell>
          </TableRow>
        ))}
        <TableRow className="hover:bg-transparent">
          <TableCell className="font-medium">Total Egresos</TableCell>
          <TableCell className="text-right font-semibold">{formatCLP(cf.expenses)}</TableCell>
          <TableCell />
        </TableRow>

        <TableRow className="hover:bg-transparent">
          <TableCell className="font-medium">Flujo Neto</TableCell>
          <TableCell className={`text-right font-semibold ${cf.net >= 0 ? "text-positive" : "text-negative"}`}>{formatCLP(cf.net, { sign: true })}</TableCell>
          <TableCell />
        </TableRow>
      </TableBody>
    </Table>
  );
}
