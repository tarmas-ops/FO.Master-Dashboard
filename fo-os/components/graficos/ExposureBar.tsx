import { formatCLP, formatPct } from "@/lib/formatters";

export interface ExposureItem {
  label: string;
  value: number;
  share: number;
}

/** Barras horizontales para exposición por moneda, geografía o sector. */
export function ExposureBar({ items }: { items: ExposureItem[] }) {
  const max = Math.max(...items.map((i) => i.share), 0.0001);
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.label}>
          <div className="flex items-baseline justify-between gap-3 text-[13px]">
            <span className="text-foreground">{item.label}</span>
            <span className="flex items-baseline gap-2.5">
              <span className="tnum font-medium text-foreground">{formatPct(item.share)}</span>
              <span className="tnum w-24 text-right text-muted">{formatCLP(item.value)}</span>
            </span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-hover">
            <div className="h-full rounded-full bg-foreground" style={{ width: `${(item.share / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
