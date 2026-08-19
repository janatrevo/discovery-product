// Integração com o Azure DevOps (board "Trevo Labs") via REST API — usada
// só para gerenciar work items do tipo Feature (criar, editar, excluir e
// listar). Autenticação por Personal Access Token (PAT), formato Basic auth
// com usuário vazio (padrão documentado da própria Microsoft para PAT:
// "Authorization: Basic base64(':' + PAT)").
//
// Referências verificadas (Microsoft Learn, REST API 7.1) antes de escrever
// este arquivo — não é um formato adivinhado:
// - Criar:  POST   {org}/{project}/_apis/wit/workitems/$Feature
// - Editar: PATCH  {org}/{project}/_apis/wit/workitems/{id}
// - Excluir:DELETE {org}/{project}/_apis/wit/workitems/{id}  (vai pra Recycle Bin; destroy=true apaga de vez — não usamos)
// - Listar: POST   {org}/{project}/_apis/wit/wiql  (WIQL) + GET .../workitems?ids=...
// - Estados válidos do tipo: GET {org}/{project}/_apis/wit/workitemtypes/Feature/states
// Todas as chamadas de criação/edição usam Content-Type: application/json-patch+json
// com um array de operações { op, path, value }.

const ORG = process.env.AZURE_DEVOPS_ORG;
const PROJECT = process.env.AZURE_DEVOPS_PROJECT;
const PAT = process.env.AZURE_DEVOPS_PAT;
const API_VERSION = "7.1";

function assertConfigured() {
  if (!ORG || !PROJECT || !PAT) {
    throw new Error(
      "Azure DevOps não configurado — defina AZURE_DEVOPS_ORG, AZURE_DEVOPS_PROJECT e AZURE_DEVOPS_PAT em .env.local."
    );
  }
}

function baseUrl() {
  return `https://dev.azure.com/${encodeURIComponent(ORG!)}/${encodeURIComponent(PROJECT!)}/_apis/wit`;
}

// Link direto para abrir o card na UI web do Azure DevOps (formato padrão
// "_workitems/edit/{id}" — não precisa de chamada de API, só monta a URL).
export function featureWebUrl(id: number) {
  return `https://dev.azure.com/${encodeURIComponent(ORG!)}/${encodeURIComponent(PROJECT!)}/_workitems/edit/${id}`;
}

// Escapa aspas simples pro literal de string do WIQL (equivalente ao SQL:
// dobra a aspa simples). Necessário porque "Trevo Labs" — como qualquer nome
// de projeto — pode conter espaço/caracteres especiais.
function escapeWiqlString(value: string) {
  return value.replace(/'/g, "''");
}

function authHeaders(extra: Record<string, string> = {}) {
  const token = Buffer.from(`:${PAT}`).toString("base64");
  return { Authorization: `Basic ${token}`, ...extra };
}

async function parseErrorBody(res: Response) {
  const body = await res.json().catch(() => ({}));
  return body?.message || `Falha na chamada ao Azure DevOps (HTTP ${res.status}).`;
}

export type AzureFeature = {
  id: number;
  title: string;
  description: string;
  state: string;
  tags: string[];
  teamProject: string;
  url: string;
  createdDate?: string;
  changedDate?: string;
};

type AdoWorkItem = {
  id: number;
  fields: Record<string, unknown>;
  _links?: { html?: { href?: string } };
};

function normalize(item: AdoWorkItem): AzureFeature {
  const f = item.fields;
  const tagsRaw = typeof f["System.Tags"] === "string" ? (f["System.Tags"] as string) : "";
  return {
    id: item.id,
    title: (f["System.Title"] as string) || "(sem título)",
    description: (f["System.Description"] as string) || "",
    state: (f["System.State"] as string) || "",
    tags: tagsRaw
      .split(";")
      .map((t) => t.trim())
      .filter(Boolean),
    teamProject: (f["System.TeamProject"] as string) || "",
    url: item._links?.html?.href || featureWebUrl(item.id),
    createdDate: f["System.CreatedDate"] as string | undefined,
    changedDate: f["System.ChangedDate"] as string | undefined,
  };
}

const FEATURE_FIELDS = [
  "System.Id",
  "System.Title",
  "System.State",
  "System.Description",
  "System.Tags",
  "System.TeamProject",
  "System.CreatedDate",
  "System.ChangedDate",
].join(",");

// Confere que um work item pertence mesmo ao projeto configurado
// (AZURE_DEVOPS_PROJECT) antes de deixar editar/excluir — em duas camadas:
// a listagem já filtra por [System.TeamProject] na query WIQL (não confia só
// no escopo da URL), e esta função é uma segunda trava para qualquer edição
// direta por id (inclusive um id digitado/copiado manualmente na URL do
// discovery-app). Nunca deixa a aplicação tocar em cards de outro projeto do
// mesmo org, como o board "Trevo" citado explicitamente como não podendo
// sofrer interferência.
function assertBelongsToProject(feature: AzureFeature) {
  if (feature.teamProject && feature.teamProject !== PROJECT) {
    throw new Error(
      `O card #${feature.id} pertence ao projeto "${feature.teamProject}" do Azure DevOps, não a "${PROJECT}" — operação bloqueada para não interferir em outro board.`
    );
  }
}

// Lista todos os cards do tipo Feature do projeto configurado, mais recentes
// primeiro. Em duas etapas (padrão da API do Azure DevOps): WIQL só devolve
// ids, depois busca os campos em lote. O filtro por [System.TeamProject] é
// explícito na query (não confia só no projeto da URL) — reforçado ainda por
// assertBelongsToProject() em qualquer edição/exclusão por id específico.
export async function listFeatures(): Promise<AzureFeature[]> {
  assertConfigured();

  const wiqlRes = await fetch(`${baseUrl()}/wiql?api-version=${API_VERSION}`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      query: `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '${escapeWiqlString(
        PROJECT!
      )}' AND [System.WorkItemType] = 'Feature' ORDER BY [System.ChangedDate] DESC`,
    }),
  });
  if (!wiqlRes.ok) throw new Error(await parseErrorBody(wiqlRes));
  const wiql = await wiqlRes.json();
  const ids: number[] = (wiql.workItems || []).map((w: { id: number }) => w.id);
  if (ids.length === 0) return [];

  // A API aceita no máximo 200 ids por chamada — o board não deve chegar
  // perto disso, mas o corte é registrado explicitamente em vez de estourar
  // silenciosamente.
  const batch = ids.slice(0, 200);
  const itemsRes = await fetch(
    `${baseUrl()}/workitems?ids=${batch.join(",")}&fields=${FEATURE_FIELDS}&api-version=${API_VERSION}`,
    { headers: authHeaders() }
  );
  if (!itemsRes.ok) throw new Error(await parseErrorBody(itemsRes));
  const items = await itemsRes.json();
  const list: AzureFeature[] = (items.value || [])
    .map(normalize)
    // Segunda trava, mesmo já filtrando na WIQL — nunca renderiza um card de
    // outro projeto por engano.
    .filter((f: AzureFeature) => !f.teamProject || f.teamProject === PROJECT);
  // A WIQL já ordena por changedDate desc, mas o batch GET não preserva
  // ordem — reordena aqui pelo mesmo critério.
  return list.sort((a, b) => (a.changedDate && b.changedDate ? (a.changedDate < b.changedDate ? 1 : -1) : 0));
}

export async function getFeature(id: number): Promise<AzureFeature> {
  assertConfigured();
  const res = await fetch(`${baseUrl()}/workitems/${id}?fields=${FEATURE_FIELDS}&api-version=${API_VERSION}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(await parseErrorBody(res));
  const feature = normalize(await res.json());
  assertBelongsToProject(feature);
  return feature;
}

// Estados válidos do tipo Feature no processo configurado para o projeto
// (Agile/Scrum/Basic/CMMI têm nomes de estado diferentes) — usado para
// popular o <select> de edição sem chutar valores fixos.
export async function getFeatureStates(): Promise<{ name: string; category: string }[]> {
  assertConfigured();
  const res = await fetch(`${baseUrl()}/workitemtypes/Feature/states?api-version=${API_VERSION}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(await parseErrorBody(res));
  const body = await res.json();
  return body.value || [];
}

export async function createFeature(input: { title: string; description?: string; tags?: string[] }) {
  assertConfigured();
  if (!input.title.trim()) throw new Error("Título é obrigatório.");

  const ops: { op: string; path: string; value: string }[] = [
    { op: "add", path: "/fields/System.Title", value: input.title.trim() },
  ];
  if (input.description) ops.push({ op: "add", path: "/fields/System.Description", value: input.description });
  if (input.tags && input.tags.length > 0) ops.push({ op: "add", path: "/fields/System.Tags", value: input.tags.join("; ") });

  const res = await fetch(`${baseUrl()}/workitems/$Feature?api-version=${API_VERSION}`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json-patch+json" }),
    body: JSON.stringify(ops),
  });
  if (!res.ok) throw new Error(await parseErrorBody(res));
  return normalize(await res.json());
}

export async function updateFeature(
  id: number,
  input: { title?: string; description?: string; tags?: string[]; state?: string }
) {
  assertConfigured();
  // getFeature já confere (internamente) que o id pertence ao projeto
  // configurado — chamá-la aqui antes de editar qualquer coisa também serve
  // pra isso, sem precisar duplicar a checagem.
  await getFeature(id);

  const ops: { op: string; path: string; value: string }[] = [];
  if (input.title !== undefined) ops.push({ op: "add", path: "/fields/System.Title", value: input.title.trim() });
  if (input.description !== undefined)
    ops.push({ op: "add", path: "/fields/System.Description", value: input.description });
  if (input.tags !== undefined) ops.push({ op: "add", path: "/fields/System.Tags", value: input.tags.join("; ") });
  if (input.state !== undefined) ops.push({ op: "add", path: "/fields/System.State", value: input.state });

  if (ops.length === 0) return getFeature(id);

  const res = await fetch(`${baseUrl()}/workitems/${id}?api-version=${API_VERSION}`, {
    method: "PATCH",
    headers: authHeaders({ "Content-Type": "application/json-patch+json" }),
    body: JSON.stringify(ops),
  });
  if (!res.ok) throw new Error(await parseErrorBody(res));
  return normalize(await res.json());
}

// Exclusão "soft" (vai para a Recycle Bin do projeto, recuperável por até 30
// dias pelo próprio Azure DevOps) — não usamos destroy=true (apagaria de vez,
// sem chance de desfazer por engano).
export async function deleteFeature(id: number) {
  assertConfigured();
  await getFeature(id);

  const res = await fetch(`${baseUrl()}/workitems/${id}?api-version=${API_VERSION}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(await parseErrorBody(res));
}

// ---------- Decisão de teste A/B, espelhada como tag no card ----------
// Guardamos a decisão de verdade no discovery-app (opportunities.abTestDecision
// — não existe campo nativo "sucesso da funcionalidade" no Azure DevOps), mas
// espelhamos como tag no card (prefixo "ab:") para aparecer direto no board
// pra quem só olha o Azure DevOps, sem precisar abrir o discovery-app.
const AB_TAG_PREFIX = "ab:";
const AB_TAG_VALUES: Record<string, string> = { testing: "em-teste", keep: "manter", remove: "remover" };
const AB_TAG_TO_DECISION: Record<string, string> = { "em-teste": "testing", manter: "keep", remover: "remove" };

export function withAbTag(tags: string[], decision: "testing" | "keep" | "remove"): string[] {
  const withoutAb = tags.filter((t) => !t.toLowerCase().startsWith(AB_TAG_PREFIX));
  return [...withoutAb, `${AB_TAG_PREFIX}${AB_TAG_VALUES[decision]}`];
}

export function parseAbTag(tags: string[]): "testing" | "keep" | "remove" | null {
  const tag = tags.find((t) => t.toLowerCase().startsWith(AB_TAG_PREFIX));
  if (!tag) return null;
  const value = tag.slice(AB_TAG_PREFIX.length).toLowerCase();
  return (AB_TAG_TO_DECISION[value] as "testing" | "keep" | "remove") ?? null;
}

// Mapeia o texto livre do estado (varia por processo — Agile/Scrum/Basic/CMMI
// têm nomes diferentes) para uma cor de status consistente, reaproveitada
// tanto na listagem (/azure-devops) quanto no roadmap (/azure-devops/roadmap)
// — mesma paleta de status já usada no resto do app para não introduzir uma
// nova convenção de cor.
export function featureStateColor(state: string): "slate" | "sky" | "emerald" | "amber" {
  const s = state.toLowerCase();
  if (s.includes("done") || s.includes("closed") || s.includes("resolved") || s.includes("completed")) return "emerald";
  if (s.includes("progress") || s.includes("active") || s.includes("doing")) return "sky";
  if (s.includes("new") || s.includes("proposed") || s.includes("to do")) return "amber";
  return "slate";
}
