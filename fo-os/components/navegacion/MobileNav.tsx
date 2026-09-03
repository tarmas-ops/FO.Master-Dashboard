"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { NAV_SECTIONS } from "./nav-config";

export function MobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger className="rounded-md p-1.5 text-muted hover:bg-hover hover:text-foreground lg:hidden" aria-label="Abrir navegación">
        <Menu className="size-5" />
      </SheetTrigger>
      <SheetContent title="Navegación" className="max-w-xs">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label} className="mb-5">
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-2">{section.label}</p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={cn("flex items-center gap-2.5 rounded-md px-2 py-2 text-[14px]", active ? "bg-hover font-medium" : "text-muted")}
                    >
                      <item.icon className="size-4" strokeWidth={1.75} />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </SheetContent>
    </Sheet>
  );
}
