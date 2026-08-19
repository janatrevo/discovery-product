// Monta o HTML do campo Description do card Feature no Azure DevOps a partir
// do PRD gerado no discovery-app. Description é o único campo garantido em
// qualquer processo (Agile/Scrum/Basic/CMMI) do Azure DevOps — por isso
// Business Rules, Acceptance Criteria e Success Metrics entram como seções
// dentro dele (com cabeçalhos <h3>), em vez de campos separados: criar campos
// customizados exigiria saber de antemão o processo configurado em Trevo
// Labs, o que não temos como confirmar sem acesso à organização no Azure
// DevOps. Se o processo do projeto permitir campos customizados, dá pra
// evoluir isto para usar campos de verdade sem mudar o resto do fluxo.
//
// O Azure DevOps renderiza System.Description como HTML (é um campo rich
// text na UI) — por isso geramos HTML básico em vez de texto puro com quebras
// de linha, que a UI colapsaria.

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function section(title: string, items: string[] | undefined) {
  if (!items || items.length === 0) return "";
  const lis = items.map((i) => `<li>${escapeHtml(i)}</li>`).join("");
  return `<h3>${escapeHtml(title)}</h3><ul>${lis}</ul>`;
}

export function buildFeatureDescription(input: {
  opportunityTitle: string;
  opportunityDescription: string;
  problemRef?: string | null;
  goals?: string[];
  nonGoals?: string[];
  openQuestions?: string[];
  businessRules?: string[];
  successMetrics?: string[];
  userStories: { asA: string | null; iWant: string; soThat: string | null; acceptanceCriteria: string[] }[];
}) {
  const parts: string[] = [];

  if (input.opportunityDescription) {
    parts.push(`<h3>Contexto</h3><p>${escapeHtml(input.opportunityDescription)}</p>`);
  }
  if (input.problemRef) {
    parts.push(`<p><strong>Problema observado:</strong> ${escapeHtml(input.problemRef)}</p>`);
  }

  parts.push(section("Objetivos", input.goals));
  parts.push(section("Fora de escopo", input.nonGoals));
  parts.push(section("Perguntas em aberto", input.openQuestions));

  if (input.userStories.length > 0) {
    const lis = input.userStories
      .map((s) => {
        const line = `Como <strong>${escapeHtml(s.asA || "usuário")}</strong>, eu quero ${escapeHtml(s.iWant)}${
          s.soThat ? ` para que ${escapeHtml(s.soThat)}` : ""
        }.`;
        return `<li>${line}</li>`;
      })
      .join("");
    parts.push(`<h3>User Stories</h3><ul>${lis}</ul>`);
  }

  parts.push(section("Business Rules", input.businessRules));

  // Acceptance Criteria consolidado: junta o de todas as stories, sem
  // duplicar entradas idênticas.
  const allAcceptanceCriteria = Array.from(
    new Set(input.userStories.flatMap((s) => s.acceptanceCriteria).filter(Boolean))
  );
  parts.push(section("Acceptance Criteria", allAcceptanceCriteria));

  parts.push(section("Success Metrics", input.successMetrics));

  parts.push(
    `<hr/><p><em>Gerado a partir do PRD no discovery-app (oportunidade "${escapeHtml(
      input.opportunityTitle
    )}"). Para alterar o conteúdo, edite o PRD lá e reenvie — mudanças feitas só aqui no card serão perdidas na próxima sincronização.</em></p>`
  );

  return parts.filter(Boolean).join("\n");
}
