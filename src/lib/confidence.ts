// Confidence Score — fórmula determinística e auditável (seção 14 da
// especificação). A IA NUNCA decide este número; ela só o explica (ver
// src/app/(app)/hypotheses/[id]/confidence-explainer.tsx). Simulação de IA
// nunca entra aqui — é filtrada antes mesmo de chegar nesta função.

export type EvidenceForScoring = {
  id: string;
  favorable: boolean;
  originClass: "real_data" | "inference" | "simulation";
  type: string; // interview | survey | usability_test | behavioral | experiment | manual
  sampleSize: number | null;
  qualityScore: number | null;
  reliabilityScore: number | null;
  evidenceDate: Date;
  personaMatchesHypothesis: boolean;
};

const METHOD_WEIGHT: Record<string, number> = {
  behavioral: 1.0,
  experiment: 0.9,
  usability_test: 0.85,
  ab_test: 0.9,
  interview: 0.7,
  survey: 0.6,
  manual: 0.5,
};

function methodWeight(type: string) {
  return METHOD_WEIGHT[type] ?? 0.5;
}

function recencyFactor(date: Date, halfLifeDays = 365) {
  const daysAgo = Math.max(0, (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
  return Math.pow(0.5, daysAgo / halfLifeDays);
}

function sampleFactor(sampleSize: number | null, threshold: number) {
  if (sampleSize == null) return 0.5; // amostra desconhecida — peso neutro-baixo
  return Math.min(1, Math.sqrt(sampleSize / Math.max(1, threshold)));
}

export type ConfidenceReceiptItem = {
  evidenceId: string;
  favorable: boolean;
  type: string;
  strength: number;
  breakdown: {
    methodWeight: number;
    recencyFactor: number;
    sampleFactor: number;
    representativeness: number;
    quality: number;
    reliability: number;
  };
};

export type ConfidenceReceipt = {
  score: number;
  favorableStrength: number;
  contraryStrength: number;
  distinctMethodsFavorable: number;
  diversityMultiplier: number;
  hasUnresolvedContrary: boolean;
  cappedByContradiction: boolean;
  items: ConfidenceReceiptItem[];
  notes: string[];
};

export function computeConfidence(
  evidenceList: EvidenceForScoring[],
  thresholds: { minSampleSurvey: number; minSampleInterview: number }
): ConfidenceReceipt {
  // Simulação nunca entra no cálculo — filtro estrutural, não configurável.
  const real = evidenceList.filter((e) => e.originClass === "real_data");

  const items: ConfidenceReceiptItem[] = real.map((e) => {
    const threshold = e.type === "survey" ? thresholds.minSampleSurvey : thresholds.minSampleInterview;
    const breakdown = {
      methodWeight: methodWeight(e.type),
      recencyFactor: recencyFactor(e.evidenceDate),
      sampleFactor: sampleFactor(e.sampleSize, threshold),
      representativeness: e.personaMatchesHypothesis ? 1 : 0.7,
      quality: (e.qualityScore ?? 70) / 100,
      reliability: (e.reliabilityScore ?? 70) / 100,
    };
    const strength =
      breakdown.methodWeight *
      breakdown.recencyFactor *
      breakdown.sampleFactor *
      breakdown.representativeness *
      breakdown.quality *
      breakdown.reliability;
    return { evidenceId: e.id, favorable: e.favorable, type: e.type, strength, breakdown };
  });

  const favorableItems = items.filter((i) => i.favorable);
  const contraryItems = items.filter((i) => !i.favorable);
  const favorableStrength = favorableItems.reduce((s, i) => s + i.strength, 0);
  const contraryStrength = contraryItems.reduce((s, i) => s + i.strength, 0);

  const distinctMethodsFavorable = new Set(favorableItems.map((i) => i.type)).size;
  const diversityMultiplier = Math.min(1.5, 1 + 0.15 * Math.max(0, distinctMethodsFavorable - 1));

  const K = 1.5; // suavização — pouca evidência nunca gera confiança alta
  let score =
    (100 * (favorableStrength * diversityMultiplier)) /
    (favorableStrength * diversityMultiplier + contraryStrength + K);

  const hasUnresolvedContrary = contraryStrength > 0;
  const notes: string[] = [];
  let cappedByContradiction = false;

  // Regra do documento: evidência contrária não endereçada nunca permite
  // confiança alta / status Validated.
  if (hasUnresolvedContrary && contraryStrength >= favorableStrength * 0.3) {
    if (score > 60) {
      score = 60;
      cappedByContradiction = true;
      notes.push(
        "Confiança limitada a 60 porque há evidência contrária relevante ainda não endereçada."
      );
    }
  }

  if (favorableItems.length > 0 && distinctMethodsFavorable < 2 && score > 65) {
    score = 65;
    notes.push("Confiança limitada a 65 porque toda evidência favorável vem de um único método/fonte.");
  }

  return {
    score: Math.round(score * 10) / 10,
    favorableStrength: Math.round(favorableStrength * 100) / 100,
    contraryStrength: Math.round(contraryStrength * 100) / 100,
    distinctMethodsFavorable,
    diversityMultiplier: Math.round(diversityMultiplier * 100) / 100,
    hasUnresolvedContrary,
    cappedByContradiction,
    items,
    notes,
  };
}
