import { ConfidenceReceipt } from "./confidence";

export type HypothesisStatus =
  | "not_tested"
  | "investigating"
  | "partially_validated"
  | "validated"
  | "invalidated"
  | "inconclusive";

export type StatusEvaluation = {
  status: HypothesisStatus;
  criteriaMet: string[];
  criteriaMissing: string[];
};

// Motor de status determinístico (seção 9 da especificação) — nenhuma
// transição para Validated/Invalidated acontece sem que estes critérios
// objetivos estejam satisfeitos. A IA nunca decide isto.
export function evaluateStatus(
  receipt: ConfidenceReceipt,
  favorableCount: number,
  contraryCount: number,
  validatedThreshold: number
): StatusEvaluation {
  const criteriaMet: string[] = [];
  const criteriaMissing: string[] = [];

  if (favorableCount === 0 && contraryCount === 0) {
    return {
      status: "not_tested",
      criteriaMet: [],
      criteriaMissing: ["Nenhuma evidência real vinculada ainda."],
    };
  }

  const twoIndependentSources = receipt.distinctMethodsFavorable >= 2 || favorableCount >= 2;
  twoIndependentSources
    ? criteriaMet.push("Ao menos 2 fontes/métodos independentes favoráveis")
    : criteriaMissing.push("Precisa de ao menos 2 fontes/métodos independentes favoráveis");

  const noUnresolvedContrary = !receipt.cappedByContradiction && !(receipt.hasUnresolvedContrary && receipt.contraryStrength >= receipt.favorableStrength * 0.3);
  noUnresolvedContrary
    ? criteriaMet.push("Sem evidência contrária relevante não endereçada")
    : criteriaMissing.push("Há evidência contrária relevante não endereçada");

  const scoreAboveThreshold = receipt.score >= validatedThreshold;
  scoreAboveThreshold
    ? criteriaMet.push(`Confiança calculada (${receipt.score}) ≥ limiar do projeto (${validatedThreshold})`)
    : criteriaMissing.push(`Confiança calculada (${receipt.score}) abaixo do limiar do projeto (${validatedThreshold})`);

  // Invalidated: contrária supera favorável com qualidade/quantidade equivalente
  if (receipt.contraryStrength > receipt.favorableStrength && contraryCount > 0) {
    if (contraryCount >= 2 || receipt.contraryStrength >= 1) {
      return {
        status: "invalidated",
        criteriaMet: ["Evidência real contrária supera favorável com qualidade/quantidade suficiente"],
        criteriaMissing: [],
      };
    }
  }

  if (twoIndependentSources && noUnresolvedContrary && scoreAboveThreshold) {
    return { status: "validated", criteriaMet, criteriaMissing };
  }

  // Inconclusive: favorável e contrária substanciais e próximas — não dá para decidir.
  const bothSubstantial = favorableCount >= 1 && contraryCount >= 1;
  const closeScores =
    Math.abs(receipt.favorableStrength - receipt.contraryStrength) <
    0.25 * Math.max(receipt.favorableStrength, receipt.contraryStrength, 0.01);
  if (bothSubstantial && closeScores) {
    return {
      status: "inconclusive",
      criteriaMet: ["Evidência favorável e contrária de força semelhante — resultado inconclusivo"],
      criteriaMissing,
    };
  }

  if (favorableCount >= 1) {
    return { status: "partially_validated", criteriaMet, criteriaMissing };
  }

  return { status: "investigating", criteriaMet, criteriaMissing };
}
