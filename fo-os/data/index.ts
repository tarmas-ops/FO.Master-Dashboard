/**
 * Fuente única de verdad financiera. Ninguna página define cifras propias;
 * todas derivan de aquí a través de /lib/calculos.
 *
 * Dos datasets:
 *   demo  — datos ficticios completos, para mostrar el producto entero.
 *   real  — exportado desde FO_Master_Consolidado.xlsx por
 *           scripts/export_real_dataset.py. Trae solo lo que el Excel contiene;
 *           lo que falta queda declarado en `dataCoverage` en vez de rellenarse
 *           con ceros, para que un módulo vacío se explique solo.
 *
 * Se elige con NEXT_PUBLIC_DATASET=real|demo (por defecto: real).
 */
import type { Database } from "@/types";
import { assets } from "./assets";
import { deals } from "./deals";
import { documents } from "./documents";
import { entities, familyOffice, ownerships, persons } from "./entities";
import { allocationTargets, asOf, capitalCalls, commitments, distributions, fx, netWorthHistory, valuations } from "./history";
import { creditLines, loans } from "./loans";
import { decisions, theses } from "./theses";
import { transactions } from "./transactions";
import realDataset from "./real/dataset.json";

export const demoDb: Database = {
  familyOffice,
  persons,
  entities,
  ownerships,
  assets,
  loans,
  creditLines,
  transactions,
  valuations,
  capitalCalls,
  distributions,
  commitments,
  documents,
  theses,
  decisions,
  deals,
  netWorthHistory,
  fx,
  allocationTargets,
  asOf,
};

/** El JSON se valida contra `Database` al importarlo; TypeScript rechaza divergencias. */
export const realDb = realDataset as unknown as Database;

export type DatasetName = "demo" | "real";

export const activeDataset: DatasetName = process.env.NEXT_PUBLIC_DATASET === "demo" ? "demo" : "real";

export const db: Database = activeDataset === "demo" ? demoDb : realDb;

export function getDb(): Database {
  return db;
}
