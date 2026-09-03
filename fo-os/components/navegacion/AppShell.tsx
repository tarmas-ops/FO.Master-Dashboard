import { TooltipProvider } from "@/components/ui/tooltip";
import { CommandBar } from "./CommandBar";
import { MobileNav } from "./MobileNav";
import { Sidebar } from "./Sidebar";

export function AppShell({ familyOfficeName, asOf, children }: { familyOfficeName: string; asOf: string; children: React.ReactNode }) {
  return (
    <TooltipProvider delayDuration={150}>
      <Sidebar familyOfficeName={familyOfficeName} />
      <div className="lg:pl-60">
        <div className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur lg:px-8">
          <MobileNav />
          <CommandBar />
          <div className="ml-auto hidden items-center gap-3 text-[12px] text-muted sm:flex">
            <span>
              Datos al <span className="tnum text-foreground">{asOf}</span>
            </span>
          </div>
        </div>
        <main className="mx-auto w-full max-w-[1440px] px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </TooltipProvider>
  );
}
