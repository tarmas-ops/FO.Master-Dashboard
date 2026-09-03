"use client";

import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS, GRID, INK, NEGATIVE, tooltipLabel, tooltipStyle, tooltipValue } from "./chart-theme";
import { formatAxisMM, formatCLP, formatMonth } from "@/lib/formatters";
import type { MonthlyCashFlow } from "@/lib/calculos";

export function CashFlowChart({ data, height = 280 }: { data: MonthlyCashFlow[]; height?: number }) {
  const rows = data.map((m) => ({ month: m.month, Ingresos: m.income, Egresos: -m.expenses, Neto: m.net }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} stackOffset="sign">
        <CartesianGrid stroke={GRID.stroke} vertical={false} />
        <XAxis dataKey="month" tickLine={false} axisLine={false} stroke={AXIS.stroke} fontSize={AXIS.fontSize} dy={6} tickFormatter={formatMonth} minTickGap={18} />
        <YAxis tickLine={false} axisLine={false} stroke={AXIS.stroke} fontSize={AXIS.fontSize} width={52} tickFormatter={(v: number) => formatAxisMM(v)} />
        <Tooltip
          {...tooltipStyle}
          formatter={tooltipValue((value, name) => [formatCLP(Math.abs(value)), name])}
          labelFormatter={tooltipLabel((label) => formatMonth(label))}
        />
        <Bar dataKey="Ingresos" stackId="cf" fill={INK} fillOpacity={0.82} radius={[2, 2, 0, 0]} />
        <Bar dataKey="Egresos" stackId="cf" fill="#b8b8c0" radius={[0, 0, 2, 2]} />
        <Line type="monotone" dataKey="Neto" stroke={NEGATIVE} strokeWidth={1.5} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
