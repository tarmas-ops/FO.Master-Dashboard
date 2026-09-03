"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS, GRID, INK, tooltipStyle, tooltipValue } from "./chart-theme";
import { formatAxisMM, formatCLP } from "@/lib/formatters";

export function GroupedBarChart({
  data,
  keys,
  height = 240,
}: {
  data: Array<Record<string, string | number>>;
  keys: Array<{ key: string; label: string; color?: string }>;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID.stroke} vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} stroke={AXIS.stroke} fontSize={AXIS.fontSize} dy={6} />
        <YAxis tickLine={false} axisLine={false} stroke={AXIS.stroke} fontSize={AXIS.fontSize} width={52} tickFormatter={(v: number) => formatAxisMM(v)} />
        <Tooltip {...tooltipStyle} formatter={tooltipValue((value, name) => [formatCLP(Math.abs(value)), name])} cursor={{ fill: "#f3f3f5" }} />
        <Legend wrapperStyle={{ fontSize: 12, color: "#71717a", paddingTop: 8 }} iconType="square" iconSize={8} />
        {keys.map((k, i) => (
          <Bar key={k.key} dataKey={k.key} name={k.label} fill={k.color ?? (i === 0 ? INK : "#b8b8c0")} radius={[3, 3, 0, 0]} maxBarSize={28} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
