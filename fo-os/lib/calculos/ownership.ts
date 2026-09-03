import type { Database, Ownership } from "@/types";

/**
 * Participación económica look-through de `fromEntityId` sobre `toEntityId`,
 * recorriendo recursivamente la cadena de participaciones directas.
 *
 * Ejemplo: FO 80% de Holding A, A 50% de SPV B, B 70% de Activo C → 28%.
 * Suma todas las rutas (participaciones indirectas paralelas) sin doble conteo:
 * cada ruta se pondera por el producto de sus porcentajes y las rutas son disjuntas
 * por construcción (cada arista se usa una vez por ruta; se protege contra ciclos).
 */
export function calculateLookThroughOwnership(
  ownerships: Ownership[],
  fromEntityId: string,
  toEntityId: string,
  visited: Set<string> = new Set(),
): number {
  if (fromEntityId === toEntityId) return 1;
  if (visited.has(fromEntityId)) return 0;
  const next = new Set(visited);
  next.add(fromEntityId);
  let total = 0;
  for (const o of ownerships) {
    if (o.ownerEntityId !== fromEntityId) continue;
    total += o.directOwnershipPercentage * calculateLookThroughOwnership(ownerships, o.ownedEntityId, toEntityId, next);
  }
  return Math.min(total, 1);
}

/** Participación económica del Family Office (entidad raíz) en una entidad. */
export function familyOwnershipOfEntity(db: Database, entityId: string): number {
  return calculateLookThroughOwnership(db.ownerships, db.familyOffice.rootEntityId, entityId);
}

/**
 * Participación económica del Family Office en un activo:
 * look-through hasta la entidad dueña × participación directa de esa entidad en el activo.
 */
export function familyOwnershipOfAsset(db: Database, assetId: string): number {
  const asset = db.assets.find((a) => a.id === assetId);
  if (!asset) return 0;
  return familyOwnershipOfEntity(db, asset.ownerEntityId) * asset.ownershipPercentage;
}

/** Participación directa del padre inmediato sobre una entidad (para mostrar en el árbol). */
export function directParents(db: Database, entityId: string): Ownership[] {
  return db.ownerships.filter((o) => o.ownedEntityId === entityId);
}

export function directChildren(db: Database, entityId: string): Ownership[] {
  return db.ownerships.filter((o) => o.ownerEntityId === entityId);
}
