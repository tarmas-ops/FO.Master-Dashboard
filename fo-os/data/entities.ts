import type { Entity, FamilyOffice, Ownership, Person } from "@/types";

export const familyOffice: FamilyOffice = {
  id: "fo",
  name: "Family Office Andes",
  baseCurrency: "CLP",
  rootEntityId: "fo",
  minimumLiquidityReserve: 900_000_000,
  maxPolicyLTV: 0.65,
};

export const persons: Person[] = [
  { id: "p1", name: "Miembro Familiar 1", role: "Principal", familyShare: 0.4 },
  { id: "p2", name: "Miembro Familiar 2", role: "Principal", familyShare: 0.3 },
  { id: "p3", name: "Miembro Familiar 3", role: "Segunda generación", familyShare: 0.3 },
];

export const entities: Entity[] = [
  {
    id: "fo",
    name: "Family Office Andes",
    entityType: "FAMILY_OFFICE",
    country: "CL",
    currency: "CLP",
    description: "Vehículo consolidador de la familia.",
  },
  {
    id: "andes",
    name: "Andes Holding SpA",
    entityType: "HOLDING",
    country: "CL",
    currency: "CLP",
    taxId: "76.111.222-3",
    description: "Holding principal: caja, renta fija, mercados públicos y participaciones operativas.",
  },
  {
    id: "cordillera-inv",
    name: "Cordillera Investments SpA",
    entityType: "HOLDING",
    country: "CL",
    currency: "CLP",
    taxId: "76.333.444-5",
    description: "Sub-holding inmobiliario y de inversiones directas.",
  },
  {
    id: "pacific-re",
    name: "Pacific Real Estate SpA",
    entityType: "SPV",
    country: "CL",
    currency: "CLP",
    taxId: "76.555.666-7",
    description: "SPV inmobiliario con socio minoritario (15%).",
  },
  {
    id: "patagonia",
    name: "Patagonia Capital SpA",
    entityType: "HOLDING",
    country: "CL",
    currency: "USD",
    taxId: "76.777.888-9",
    description: "Vehículo de mercados privados y participaciones en crecimiento.",
  },
];

/**
 * Solo participaciones DIRECTAS. La participación económica final de la familia en
 * cada activo se calcula recursivamente (look-through), nunca se guarda.
 */
export const ownerships: Ownership[] = [
  { id: "o1", ownerEntityId: "fo", ownedEntityId: "andes", directOwnershipPercentage: 1, votingOwnershipPercentage: 1, effectiveDate: "2015-03-01" },
  { id: "o2", ownerEntityId: "andes", ownedEntityId: "cordillera-inv", directOwnershipPercentage: 1, votingOwnershipPercentage: 1, effectiveDate: "2016-06-01" },
  { id: "o3", ownerEntityId: "cordillera-inv", ownedEntityId: "pacific-re", directOwnershipPercentage: 0.85, votingOwnershipPercentage: 0.85, effectiveDate: "2018-01-15" },
  { id: "o4", ownerEntityId: "fo", ownedEntityId: "patagonia", directOwnershipPercentage: 1, votingOwnershipPercentage: 1, effectiveDate: "2019-04-01" },
];
