// Os 10 tipos de hipótese da seção 9 da especificação, com o texto de ajuda
// que aparece no formulário para reduzir hipóteses mal-formadas.
export const HYPOTHESIS_TYPES: { value: string; label: string; hint: string }[] = [
  { value: "problem", label: "Problem", hint: '"A persona X enfrenta o problema Y"' },
  { value: "user_behavioral", label: "User/Behavioral", hint: '"A persona X possui o comportamento Y"' },
  { value: "solution", label: "Solution", hint: '"A solução X resolve o problema Y"' },
  { value: "value", label: "Value", hint: '"Usuários percebem valor suficiente na solução X"' },
  { value: "usability", label: "Usability", hint: '"Usuários conseguem realizar a tarefa X usando a interface Y"' },
  { value: "business_outcome", label: "Business/Outcome", hint: '"Este comportamento gera o resultado de negócio X"' },
  { value: "pricing", label: "Pricing", hint: '"Usuários estão dispostos a pagar X"' },
  { value: "acquisition_channel", label: "Acquisition/Channel", hint: '"O canal X é eficiente para adquirir esse perfil de usuário"' },
  { value: "retention_engagement", label: "Retention/Engagement", hint: '"Usuários continuam usando X pelo motivo Y"' },
  { value: "ecosystem_partnership", label: "Ecosystem/Partnership", hint: '"O parceiro/canal X amplia o alcance da solução Y"' },
];

export const STATUS_LABELS: Record<string, string> = {
  not_tested: "Not Tested",
  investigating: "Investigating",
  partially_validated: "Partially Validated",
  validated: "Validated",
  invalidated: "Invalidated",
  inconclusive: "Inconclusive",
};

export const STATUS_COLORS: Record<string, "slate" | "emerald" | "amber" | "red" | "sky" | "indigo" | "violet"> = {
  not_tested: "slate",
  investigating: "sky",
  partially_validated: "amber",
  validated: "emerald",
  invalidated: "red",
  inconclusive: "violet",
};
