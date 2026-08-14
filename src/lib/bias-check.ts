// Detecção de leading questions — determinística/baseada em regras (seção 22
// da especificação trata isso como parte de Bias Detection). Roda no
// momento da criação da pergunta, antes de publicar o survey.
const LEADING_PATTERNS: { pattern: RegExp; note: string }[] = [
  { pattern: /não (seria|seriam|é|seria melhor)/i, note: 'Frase do tipo "não seria..." tende a induzir a resposta desejada.' },
  { pattern: /você concorda que/i, note: 'Perguntas com "você concorda que" pressupõem a resposta.' },
  { pattern: /obviamente|claramente melhor|é óbvio que/i, note: "Linguagem que já assume uma conclusão como óbvia." },
  { pattern: /o quão (incrível|ótimo|fantástico|ruim|péssimo)/i, note: "Escala de pergunta já carrega um julgamento de valor." },
  { pattern: /não acha que/i, note: 'Frase do tipo "não acha que..." sugere a resposta esperada.' },
];

export function checkLeadingQuestion(text: string): { leading: boolean; note: string | null } {
  for (const { pattern, note } of LEADING_PATTERNS) {
    if (pattern.test(text)) return { leading: true, note };
  }
  return { leading: false, note: null };
}
