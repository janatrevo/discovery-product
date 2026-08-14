// Score de priorização — nunca decidido por IA. Combina impacto/frequência/
// severidade/potencial de negócio/facilidade de solução (inputs humanos,
// 1-5 cada) com a confiança de evidência herdada da hipótese de origem (se
// houver). Uma oportunidade com pontuação alta mas sem evidência real por
// trás pesa menos do que uma com o mesmo score apoiada em dados reais —
// isso é intencional: o board não deve premiar oportunidades "acreditadas"
// sobre oportunidades "validadas".
export function computePriorityScore(input: {
  impact: number;
  frequency: number;
  severity: number;
  businessPotential: number;
  solutionEase: number;
  evidenceConfidence: number;
}) {
  const base = (input.impact + input.frequency + input.severity + input.businessPotential + input.solutionEase) / 5;
  const evidenceMultiplier = 0.5 + 0.5 * (Math.min(100, Math.max(0, input.evidenceConfidence)) / 100);
  return Math.round(base * evidenceMultiplier * 100) / 100;
}
