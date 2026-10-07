// Rótulo legível de uma entrevista, usado em listas, títulos e evidências.
// Prioriza os campos estruturados (nome / cargo / laboratório) e cai para a
// identificação livre (intervieweeRef) em entrevistas antigas.
export function interviewLabel(iv: {
  intervieweeName?: string | null;
  intervieweeRole?: string | null;
  intervieweeLab?: string | null;
  intervieweeRef?: string | null;
}): string {
  const name = iv.intervieweeName?.trim();
  const parts = [name, iv.intervieweeRole?.trim(), iv.intervieweeLab?.trim()].filter(Boolean) as string[];
  if (parts.length > 0) return parts.join(" — ");
  return iv.intervieweeRef?.trim() || "";
}
