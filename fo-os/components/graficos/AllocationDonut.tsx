"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { CHART_COLORS, tooltipStyle, tooltipValueWithPayload } from "./chart-theme";
import { formatCLP, formatPct } from "@/lib/formatters";

export interface DonutSlice {
  label: string;
  value: number;
  share: number;
}

export function AllocationDonut({ data, height = 220 }: { data: DonutSlice[]; height?: number }) {
  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row">
      <div style={{ width: height, height }} className="shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="label" innerRadius="62%" outerRadius="92%" paddingAngle={1.5} stroke="#ffffff" strokeWidth={1.5}>
              {data.map((d, i) => (
                <Cell key={d.label} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              {...tooltipStyle}
              formatter={tooltipValueWithPayload<DonutSlice>((value, slice) => [`${formatCLP(value)} · ${formatPct(slice.share)}`, slice.label])}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="w-full flex-1 space-y-1.5">
        {data.map((d, i) => (
          <li key={d.label} className="flex items-center gap-2.5 text-[13px]">
            <span className="size-2 shrink-0 rounded-[2px]" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
            <span className="flex-1 truncate text-foreground">{d.label}</span>
            <span className="tnum w-14 text-right font-medium text-foreground">{formatPct(d.share)}</span>
            <span className="tnum w-24 text-right text-muted">{formatCLP(d.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
