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
  // Quando as stories são enviadas como itens filhos da Feature (cada uma com
  // seus critérios de aceite), não repetimos a lista delas aqui.
  storiesAsChildren?: boolean;
  // Quando a Feature tem campo próprio para a parte, ela NÃO entra na
  // Description (false). Sem campo próprio, entra aqui como seção (true).
  inline?: { businessRules?: boolean; acceptanceCriteria?: boolean; successMetrics?: boolean };
}) {
  const inline = { businessRules: true, acceptanceCriteria: true, successMetrics: true, ...input.inline };
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

  if (input.storiesAsChildren && input.userStories.length > 0) {
    parts.push(
      `<h3>User Stories</h3><p>${input.userStories.length} user stories vinculadas a esta Feature (veja a aba Related Work / itens filhos).</p>`
    );
  } else if (input.userStories.length > 0) {
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

  if (inline.businessRules) parts.push(section("Business Rules", input.businessRules));

  // Acceptance Criteria consolidado: junta o de todas as stories, sem
  // duplicar entradas idênticas.
  const allAcceptanceCriteria = Array.from(
    new Set(input.userStories.flatMap((s) => s.acceptanceCriteria).filter(Boolean))
  );
  if (inline.acceptanceCriteria) parts.push(section("Acceptance Criteria", allAcceptanceCriteria));

  if (inline.successMetrics) parts.push(section("Success Metrics", input.successMetrics));

  parts.push(
    `<hr/><p><em>Gerado a partir do PRD no discovery-app (oportunidade "${escapeHtml(
      input.opportunityTitle
    )}"). Para alterar o conteúdo, edite o PRD lá e reenvie — mudanças feitas só aqui no card serão perdidas na próxima sincronização.</em></p>`
  );

  return parts.filter(Boolean).join("\n");
}


// ---- User Stories enviadas como itens filhos da Feature ----

export type StoryForAzure = {
  id: string;
  asA: string | null;
  iWant: string;
  soThat: string | null;
  acceptanceCriteria: string[];
  priority: string; // must | should | could
};

const PRIORITY_LABEL: Record<string, string> = { must: "Deve ter", should: "Deveria ter", could: "Poderia ter" };

// Azure: Priority 1 (mais alta) a 4.
export function storyAzurePriority(priority: string) {
  return priority === "must" ? 1 : priority === "could" ? 3 : 2;
}

export function storyPriorityLabel(priority: string) {
  return PRIORITY_LABEL[priority] ?? priority;
}

export function storyTitle(s: StoryForAzure) {
  const text = `Como ${s.asA || "usuário"}, quero ${s.iWant}`.replace(/\s+/g, " ").trim();
  return text.length > 250 ? `${text.slice(0, 247)}…` : text;
}

export function buildAcceptanceCriteriaHtml(items: string[]) {
  const clean = items.filter(Boolean);
  if (clean.length === 0) return "";
  return `<ul>${clean.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`;
}

export function buildStoryDescription(s: StoryForAzure, includeCriteria: boolean) {
  const parts = [
    `<p>Como <strong>${escapeHtml(s.asA || "usuário")}</strong>, quero ${escapeHtml(s.iWant)}${
      s.soThat ? `, para ${escapeHtml(s.soThat)}` : ""
    }.</p>`,
    `<p><strong>Prioridade:</strong> ${escapeHtml(storyPriorityLabel(s.priority))}</p>`,
  ];
  if (includeCriteria && s.acceptanceCriteria.length > 0) {
    parts.push(`<h3>Critérios de aceite</h3>${buildAcceptanceCriteriaHtml(s.acceptanceCriteria)}`);
  }
  parts.push(
    `<hr/><p><em>Gerada a partir do PRD no discovery-app. Para alterar, edite lá e reenvie a Feature — mudanças feitas só aqui serão sobrescritas.</em></p>`
  );
  return parts.join("\n");
}


// ---- Conteúdo dos campos próprios da Feature ----

export function buildListHtml(items: string[] | undefined) {
  const clean = (items ?? []).filter(Boolean);
  if (clean.length === 0) return "";
  return `<ul>${clean.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`;
}

// Critérios de aceite da Feature: os de cada user story, agrupados por story.
export function buildFeatureAcceptanceHtml(
  stories: { asA: string | null; iWant: string; acceptanceCriteria: string[] }[]
) {
  return stories
    .filter((s) => s.acceptanceCriteria.some(Boolean))
    .map(
      (s) =>
        `<p><strong>Como ${escapeHtml(s.asA || "usuário")}, quero ${escapeHtml(s.iWant)}</strong></p>${buildListHtml(
          s.acceptanceCriteria
        )}`
    )
    .join("");
}
