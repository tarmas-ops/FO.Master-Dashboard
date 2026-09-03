"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS, GRID, INK, NEGATIVE, POSITIVE, tooltipStyle, tooltipValue } from "./chart-theme";
import { formatAxisMM, formatCLP } from "@/lib/formatters";

export interface BarPoint {
  label: string;
  value: number;
}

/** Barras verticales para series simples (valorización, NOI, contribuciones vs distribuciones). */
export function SimpleBarChart({
  data,
  height = 220,
  valueLabel = "Valor",
  signed = false,
  formatValue = formatCLP,
}: {
  data: BarPoint[];
  height?: number;
  valueLabel?: string;
  signed?: boolean;
  formatValue?: (v: number) => string;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID.stroke} vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} stroke={AXIS.stroke} fontSize={AXIS.fontSize} dy={6} />
        <YAxis tickLine={false} axisLine={false} stroke={AXIS.stroke} fontSize={AXIS.fontSize} width={52} tickFormatter={(v: number) => formatAxisMM(v)} />
        <Tooltip {...tooltipStyle} formatter={tooltipValue((value) => [formatValue(value), valueLabel])} cursor={{ fill: "#f3f3f5" }} />
        <Bar dataKey="value" radius={[3, 3, 0, 0]} maxBarSize={54}>
          {data.map((d) => (
            <Cell key={d.label} fill={signed ? (d.value >= 0 ? POSITIVE : NEGATIVE) : INK} fillOpacity={signed ? 0.85 : 0.88} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
