import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { AppShell } from "@/components/navegacion/AppShell";
import { activeDataset, db } from "@/data";
import { formatDate } from "@/lib/formatters";
import "./globals.css";

export const metadata: Metadata = {
  title: "Family Office OS",
  description: "Sistema operativo de family office: patrimonio, liquidez, riesgo, deuda, rendimiento y oportunidades.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <AppShell
          familyOfficeName={db.familyOffice.name}
          asOf={formatDate(db.asOf)}
          dataLabel={activeDataset === "real" ? `Fuente: ${db.dataCoverage?.source ?? "archivo maestro"}` : "Datos ficticios — demo"}
        >
          {children}
        </AppShell>
      </body>
    </html>
  );
}
