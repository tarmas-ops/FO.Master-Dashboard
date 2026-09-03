"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_SECTIONS } from "./nav-config";

export function Sidebar({
  familyOfficeName,
  dataLabel,
  showLogout,
}: {
  familyOfficeName: string;
  dataLabel: string;
  showLogout: boolean;
}) {
  const pathname = usePathname();
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border bg-card lg:flex">
      <div className="flex h-14 items-center gap-2.5 border-b border-border px-5">
        <div className="flex size-6 items-center justify-center rounded-[6px] bg-foreground text-[11px] font-semibold text-white">FO</div>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold leading-tight text-foreground">{familyOfficeName}</p>
          <p className="text-[11px] leading-tight text-muted">Sistema Operativo</p>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label} className="mb-5">
            <p className="mb-1.5 px-2 text-[11px] font-medium uppercase tracking-wider text-muted-2">{section.label}</p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] transition-colors",
                        active ? "bg-hover font-medium text-foreground" : "text-muted hover:bg-hover hover:text-foreground",
                      )}
                    >
                      <item.icon className={cn("size-4 shrink-0", active ? "text-foreground" : "text-muted-2")} strokeWidth={1.75} />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-3">
        <p className="truncate text-[11px] text-muted-2">{dataLabel}</p>
        {showLogout ? (
          <form action="/api/logout" method="POST">
            <button type="submit" className="text-[11px] text-muted-2 transition-colors hover:text-foreground">
              Salir
            </button>
          </form>
        ) : null}
      </div>
    </aside>
  );
}
