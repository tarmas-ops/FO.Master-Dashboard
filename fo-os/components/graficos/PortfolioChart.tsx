"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS, GRID, INK, tooltipLabelWithPayload, tooltipStyle, tooltipValue } from "./chart-theme";
import { formatAxisMM, formatCLP, formatPct } from "@/lib/formatters";
import type { NetWorthPoint } from "@/lib/calculos";

export function PortfolioChart({ data, height = 260 }: { data: NetWorthPoint[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="nwFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={INK} stopOpacity={0.1} />
            <stop offset="100%" stopColor={INK} stopOpacity={0.01} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID.stroke} vertical={false} />
        <XAxis dataKey="year" tickLine={false} axisLine={false} stroke={AXIS.stroke} fontSize={AXIS.fontSize} dy={6} />
        <YAxis
          tickLine={false}
          axisLine={false}
          stroke={AXIS.stroke}
          fontSize={AXIS.fontSize}
          width={52}
          tickFormatter={(v: number) => formatAxisMM(v)}
        />
        <Tooltip
          {...tooltipStyle}
          formatter={tooltipValue((value, name) => {
            const labels: Record<string, string> = {
              netWorth: "Patrimonio Neto",
              investmentGain: "Ganancia de inversiones",
              distributions: "Distribuciones",
              contributions: "Contribuciones",
            };
            return [formatCLP(value), labels[name] ?? name];
          })}
          labelFormatter={tooltipLabelWithPayload<NetWorthPoint>((label, rows) => {
            const p = rows[0]?.payload;
            return p?.changePct != null ? `${label} · ${formatPct(p.changePct, { sign: true })} vs. año anterior` : label;
          })}
        />
        <Area type="monotone" dataKey="netWorth" stroke={INK} strokeWidth={1.75} fill="url(#nwFill)" dot={{ r: 2.5, fill: INK }} activeDot={{ r: 4 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
