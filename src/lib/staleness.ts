// Alerta de decaimento de evidência — deriva a "idade" da evidência mais
// recente a partir do recencyFactor já calculado no Confidence Receipt
// (src/lib/confidence.ts), sem precisar de nenhuma query nova nem duplicar a
// leitura de datas: recencyFactor = 0.5^(dias/halfLife)
//   =>  dias = -halfLife * log2(recencyFactor)
// Isso mantém a lógica determinística (nunca decidida pela IA), igual ao
// resto do sistema de confiança.
import type { ConfidenceReceipt } from "./confidence";

const STALE_THRESHOLD_DAYS = 180;
const HALF_LIFE_DAYS = 365; // deve espelhar recencyFactor() em confidence.ts

export type StalenessInfo = {
  hasRealEvidence: boolean;
  daysSinceLatest: number | null;
  isStale: boolean;
};

export function computeStalenessFromReceipt(
  receipt: ConfidenceReceipt | null | undefined
): StalenessInfo {
  if (!receipt || receipt.items.length === 0) {
    return { hasRealEvidence: false, daysSinceLatest: null, isStale: false };
  }
  const maxRecencyFactor = Math.max(...receipt.items.map((i) => i.breakdown.recencyFactor));
  if (!(maxRecencyFactor > 0)) {
    return { hasRealEvidence: true, daysSinceLatest: null, isStale: false };
  }
  const daysSinceLatest = Math.round(-HALF_LIFE_DAYS * Math.log2(maxRecencyFactor));
  return {
    hasRealEvidence: true,
    daysSinceLatest,
    isStale: daysSinceLatest > STALE_THRESHOLD_DAYS,
  };
}
