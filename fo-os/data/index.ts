/**
 * Base de datos mock. Es la ÚNICA fuente de verdad financiera: ninguna página
 * define cifras propias; todas derivan de aquí a través de /lib/calculos.
 *
 * Para conectar PostgreSQL/Prisma más adelante, basta con reemplazar `db` por una
 * función que cargue estas mismas colecciones desde la base de datos.
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

export const db: Database = {
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

export function getDb(): Database {
  return db;
}
