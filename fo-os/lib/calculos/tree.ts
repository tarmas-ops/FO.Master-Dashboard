import type { Database } from "@/types";
import { calculateAssetEquity } from "./networth";
import { directChildren, familyOwnershipOfEntity } from "./ownership";

export interface TreeNode {
  id: string;
  name: string;
  kind: "ENTIDAD" | "ACTIVO";
  type: string;
  /** Participación directa del padre sobre este nodo (0–1). */
  directShare: number;
  /** Participación económica del Family Office (look-through, 0–1). */
  economicShare: number;
  /** Equity atribuible al Family Office bajo este nodo. */
  attributableEquity: number;
  country?: string;
  currency?: string;
  href?: string;
  children: TreeNode[];
}

/** Equity atribuible al FO de todos los activos colgando de una entidad y sus hijas. */
function subtreeEquity(db: Database, entityId: string, seen: Set<string>): number {
  if (seen.has(entityId)) return 0;
  seen.add(entityId);
  const own = db.assets
    .filter((a) => a.ownerEntityId === entityId)
    .reduce((acc, a) => acc + calculateAssetEquity(db, a).attributableEquity, 0);
  const fromChildren = directChildren(db, entityId).reduce((acc, o) => acc + subtreeEquity(db, o.ownedEntityId, seen), 0);
  return own + fromChildren;
}

/**
 * Árbol Familia → Holdings → SPVs → Activos. Cada nodo trae su participación
 * directa y su participación económica look-through calculada recursivamente.
 */
export function buildOwnershipTree(db: Database, rootId = db.familyOffice.rootEntityId): TreeNode {
  const build = (entityId: string, directShare: number, visited: Set<string>): TreeNode => {
    const entity = db.entities.find((e) => e.id === entityId);
    const economicShare = familyOwnershipOfEntity(db, entityId);
    const next = new Set(visited);
    next.add(entityId);

    const childEntities = directChildren(db, entityId)
      .filter((o) => !visited.has(o.ownedEntityId))
      .map((o) => build(o.ownedEntityId, o.directOwnershipPercentage, next));

    const assetNodes: TreeNode[] = db.assets
      .filter((a) => a.ownerEntityId === entityId)
      .map((a) => {
        const eq = calculateAssetEquity(db, a);
        return {
          id: a.id,
          name: a.name,
          kind: "ACTIVO" as const,
          type: a.subAssetClass,
          directShare: a.ownershipPercentage,
          economicShare: eq.familyShare,
          attributableEquity: eq.attributableEquity,
          country: a.country,
          currency: a.currency,
          href: a.assetClass === "INMOBILIARIO" ? `/inmobiliario/${a.id}` : undefined,
          children: [],
        };
      })
      .sort((a, b) => b.attributableEquity - a.attributableEquity);

    return {
      id: entityId,
      name: entity?.name ?? entityId,
      kind: "ENTIDAD",
      type: entity?.entityType ?? "",
      directShare,
      economicShare,
      attributableEquity: subtreeEquity(db, entityId, new Set()),
      country: entity?.country,
      currency: entity?.currency,
      children: [...childEntities, ...assetNodes],
    };
  };
  return build(rootId, 1, new Set());
}
