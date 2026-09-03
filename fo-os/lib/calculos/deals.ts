import type { Deal, DealScore, DealStage } from "@/types";

export const DEAL_STAGES: DealStage[] = [
  "ORIGINADO",
  "EVALUACION_INICIAL",
  "UNDERWRITING",
  "DUE_DILIGENCE",
  "COMITE_INVERSIONES",
  "NEGOCIACION",
  "CERRADO",
  "DESCARTADO",
];

export const DEAL_STAGE_LABELS: Record<DealStage, string> = {
  ORIGINADO: "Originado",
  EVALUACION_INICIAL: "Evaluación Inicial",
  UNDERWRITING: "Underwriting",
  DUE_DILIGENCE: "Due Diligence",
  COMITE_INVERSIONES: "Comité de Inversiones",
  NEGOCIACION: "Negociación",
  CERRADO: "Cerrado",
  DESCARTADO: "Descartado",
};

/** Pesos del score de inversión. Preparado para calibrarse; hoy no decide nada por sí solo. */
export const SCORE_WEIGHTS: Record<keyof DealScore, { weight: number; label: string }> = {
  retorno: { weight: 0.2, label: "Retorno" },
  riesgo: { weight: 0.15, label: "Riesgo" },
  calidadActivo: { weight: 0.15, label: "Calidad del Activo" },
  calidadContraparte: { weight: 0.1, label: "Calidad de Contraparte" },
  liquidez: { weight: 0.08, label: "Liquidez" },
  complejidad: { weight: 0.07, label: "Complejidad" },
  downsideProtection: { weight: 0.15, label: "Downside Protection" },
  conviccion: { weight: 0.1, label: "Convicción" },
};

/** Score 0–100 ponderado. Es una ayuda de priorización, no una decisión automática. */
export function calculateDealScore(score: DealScore): number {
  const total = (Object.keys(SCORE_WEIGHTS) as Array<keyof DealScore>).reduce(
    (acc, k) => acc + score[k] * SCORE_WEIGHTS[k].weight,
    0,
  );
  return Math.round(total);
}

export interface PipelineSummary {
  byStage: Array<{ stage: DealStage; label: string; deals: Deal[]; equity: number }>;
  activeDeals: Deal[];
  activeEquity: number;
  weightedEquity: number;
  averageIRR: number;
}

const CLOSED_STAGES: DealStage[] = ["CERRADO", "DESCARTADO"];

export function pipelineSummary(deals: Deal[]): PipelineSummary {
  const active = deals.filter((d) => !CLOSED_STAGES.includes(d.stage));
  return {
    byStage: DEAL_STAGES.map((stage) => {
      const rows = deals.filter((d) => d.stage === stage);
      return { stage, label: DEAL_STAGE_LABELS[stage], deals: rows, equity: rows.reduce((a, d) => a + d.equityRequired, 0) };
    }),
    activeDeals: active,
    activeEquity: active.reduce((a, d) => a + d.equityRequired, 0),
    weightedEquity: active.reduce((a, d) => a + d.equityRequired * d.closeProbability, 0),
    averageIRR: active.length > 0 ? active.reduce((a, d) => a + d.expectedIRR, 0) / active.length : 0,
  };
}
