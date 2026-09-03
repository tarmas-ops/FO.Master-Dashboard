import type { AssetClass, Country, Currency, Database, Sector } from "@/types";
import { allAssetEquities, calculateNetWorth, type AssetEquity } from "./networth";

export interface ExposureRow<K extends string> {
  key: K;
  label: string;
  value: number;
  share: number;
}

export const ASSET_CLASS_LABELS: Record<AssetClass, string> = {
  INMOBILIARIO: "Inmobiliario",
  EMPRESAS_PRIVADAS: "Empresas Privadas",
  MERCADOS_PRIVADOS: "Mercados Privados",
  MERCADOS_PUBLICOS: "Acciones Públicas",
  RENTA_FIJA: "Renta Fija",
  CAJA: "Caja",
  OTROS: "Otros",
};

export const ASSET_CLASS_ORDER: AssetClass[] = [
  "INMOBILIARIO",
  "EMPRESAS_PRIVADAS",
  "MERCADOS_PRIVADOS",
  "MERCADOS_PUBLICOS",
  "RENTA_FIJA",
  "CAJA",
  "OTROS",
];

export const COUNTRY_LABELS: Record<Country, string> = { CL: "Chile", US: "Estados Unidos", GLOBAL: "Global" };

export const SECTOR_LABELS: Record<Sector, string> = {
  INMOBILIARIO: "Inmobiliario",
  LOGISTICA: "Logística",
  SERVICIOS: "Servicios",
  ENERGIA: "Energía",
  TECNOLOGIA: "Tecnología",
  FINANCIERO: "Financiero",
  CONSUMO: "Consumo",
  MATERIALES: "Materiales",
  DIVERSIFICADO: "Diversificado",
};

function groupExposure<K extends string>(
  equities: AssetEquity[],
  keyOf: (e: AssetEquity) => K,
  labelOf: (k: K) => string,
  order?: K[],
): ExposureRow<K>[] {
  const total = equities.reduce((a, e) => a + e.economicValue, 0);
  const map = new Map<K, number>();
  for (const e of equities) {
    const k = keyOf(e);
    map.set(k, (map.get(k) ?? 0) + e.economicValue);
  }
  const keys = order ? order.filter((k) => map.has(k)) : [...map.keys()];
  return keys
    .map((k) => ({ key: k, label: labelOf(k), value: map.get(k) ?? 0, share: total > 0 ? (map.get(k) ?? 0) / total : 0 }))
    .sort((a, b) => (order ? 0 : b.value - a.value));
}

/** Exposición económica real por clase de activo (look-through). */
export function calculateEconomicExposure(db: Database): ExposureRow<AssetClass>[] {
  return groupExposure(allAssetEquities(db), (e) => e.asset.assetClass, (k) => ASSET_CLASS_LABELS[k], ASSET_CLASS_ORDER);
}

export function calculateCurrencyExposure(db: Database): ExposureRow<Currency>[] {
  return groupExposure(allAssetEquities(db), (e) => e.asset.currency, (k) => k, ["CLP", "UF", "USD"]);
}

export function calculateGeographicExposure(db: Database): ExposureRow<Country>[] {
  return groupExposure(allAssetEquities(db), (e) => e.asset.country, (k) => COUNTRY_LABELS[k], ["CL", "US", "GLOBAL"]);
}

export function calculateSectorExposure(db: Database): ExposureRow<Sector>[] {
  return groupExposure(allAssetEquities(db), (e) => e.asset.sector, (k) => SECTOR_LABELS[k]);
}

export function calculateEntityExposure(db: Database): ExposureRow<string>[] {
  const names = new Map(db.entities.map((e) => [e.id, e.name]));
  return groupExposure(allAssetEquities(db), (e) => e.asset.ownerEntityId, (k) => names.get(k) ?? k);
}

export interface TopExposure {
  asset: AssetEquity["asset"];
  economicValue: number;
  shareOfAssets: number;
  shareOfNetWorth: number;
}

/** Principales exposiciones por valor económico. */
export function calculateTopExposures(db: Database, limit = 10): TopExposure[] {
  const { totalAssets, netWorth } = calculateNetWorth(db);
  return allAssetEquities(db)
    .filter((e) => e.asset.assetClass !== "CAJA")
    .sort((a, b) => b.economicValue - a.economicValue)
    .slice(0, limit)
    .map((e) => ({
      asset: e.asset,
      economicValue: e.economicValue,
      shareOfAssets: totalAssets > 0 ? e.economicValue / totalAssets : 0,
      shareOfNetWorth: netWorth > 0 ? e.economicValue / netWorth : 0,
    }));
}
