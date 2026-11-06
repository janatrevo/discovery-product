// Nomes dos métodos de experimento em português — um só lugar para as telas.
export const EXPERIMENT_METHOD_LABELS: Record<string, string> = {
  interview: "Entrevista",
  field_observation: "Observação em campo (imersão)",
  survey: "Survey",
  usability_test: "Teste de usabilidade",
  concept_test: "Teste de conceito",
  landing_page: "Landing page",
  fake_door: "Fake door",
  ab_test: "A/B test",
  prototype_test: "Teste de protótipo",
  price_test: "Teste de preço",
};

export function experimentMethodLabel(method: string): string {
  return EXPERIMENT_METHOD_LABELS[method] ?? method;
}
