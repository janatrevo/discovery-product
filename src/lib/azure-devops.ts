// Integração com o Azure DevOps (board "Trevo One") via REST API — usada
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

import {
  buildAcceptanceCriteriaHtml,
  buildStoryDescription,
  storyAzurePriority,
  storyTitle,
  type StoryForAzure,
} from "./azure-feature-description";

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
// dobra a aspa simples). Necessário porque "Trevo One" — como qualquer nome
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
  const base = body?.message || `Falha na chamada ao Azure DevOps (HTTP ${res.status}).`;
  // 401/403/404 quase sempre são configuração (token, organização ou nome do
  // projeto). Mostramos o que o servidor está usando — nunca o token em si,
  // só o tamanho e se tem espaço ou quebra de linha sobrando — para dar para
  // conferir contra o que está no Vercel e no Azure.
  if (res.status === 401 || res.status === 403 || res.status === 404) {
    const pat = PAT ?? "";
    const sujo = pat !== pat.trim() || /["'\s]/.test(pat);
    const dica =
      res.status === 401
        ? "O Azure não reconheceu o token. Confira: se o token não venceu, se foi criado na organização certa (ou em \"All accessible organizations\") e com a permissão Work Items → Read & write, e se o nome da organização está igual ao da URL do Azure."
        : res.status === 403
          ? "O token foi reconhecido mas não tem permissão. Crie outro com Work Items → Read & write."
          : "Organização ou projeto não encontrados. Confira o nome na URL do Azure.";
    return `${base} ${dica} [servidor usa: organização="${ORG}", projeto="${PROJECT}", token com ${pat.length} caracteres${
      sujo ? " (ATENÇÃO: tem espaço, aspas ou quebra de linha)" : ""
    }]`;
  }
  return base;
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

export async function createFeature(input: {
  title: string;
  description?: string;
  tags?: string[];
  // Campos próprios da Feature (referenceName -> HTML), ex.: regras de negócio.
  fields?: Record<string, string>;
}) {
  assertConfigured();
  if (!input.title.trim()) throw new Error("Título é obrigatório.");

  const ops: { op: string; path: string; value: string }[] = [
    { op: "add", path: "/fields/System.Title", value: input.title.trim() },
  ];
  if (input.description) ops.push({ op: "add", path: "/fields/System.Description", value: input.description });
  if (input.tags && input.tags.length > 0) ops.push({ op: "add", path: "/fields/System.Tags", value: input.tags.join("; ") });
  for (const [ref, value] of Object.entries(input.fields ?? {})) {
    if (value) ops.push({ op: "add", path: `/fields/${ref}`, value });
  }

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
  input: { title?: string; description?: string; tags?: string[]; state?: string; fields?: Record<string, string> }
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
  // No reenvio, campo vazio limpa o conteúdo antigo (para não sobrar texto desatualizado).
  for (const [ref, value] of Object.entries(input.fields ?? {})) ops.push({ op: "add", path: `/fields/${ref}`, value });

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


// ---------------------------------------------------------------------------
// User Stories como itens FILHOS da Feature
// ---------------------------------------------------------------------------
// O tipo do item de história muda conforme o processo do projeto no Azure:
// Agile = "User Story", Scrum = "Product Backlog Item", CMMI = "Requirement".
// Descobrimos qual existe no projeto em vez de fixar um nome. O vínculo com a
// Feature é a relação de hierarquia (filho -> pai: Hierarchy-Reverse).
// Para não duplicar ao reenviar, cada história recebe a tag
// "discovery-story-<id>" e, no reenvio, os filhos da Feature são lidos e
// casados por essa tag (atualiza o que existe, cria só o que falta).

const STORY_TYPE_PREFERENCE = ["User Story", "Product Backlog Item", "Requirement"];
const STORY_TAG_PREFIX = "discovery-story-";
const FIELD_ACCEPTANCE = "Microsoft.VSTS.Common.AcceptanceCriteria";
const FIELD_PRIORITY = "Microsoft.VSTS.Common.Priority";

let storyTypeCache: { name: string; fields: Set<string> } | null = null;

async function getStoryType() {
  if (storyTypeCache) return storyTypeCache;
  const res = await fetch(`${baseUrl()}/workitemtypes?api-version=${API_VERSION}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await parseErrorBody(res));
  const names: string[] = ((await res.json()).value ?? []).map((t: { name: string }) => t.name);
  const name = STORY_TYPE_PREFERENCE.find((n) => names.includes(n));
  if (!name) {
    throw new Error(
      `Este projeto do Azure DevOps não tem um tipo de história (${STORY_TYPE_PREFERENCE.join(", ")}). Tipos encontrados: ${names.join(", ")}.`
    );
  }
  const fres = await fetch(`${baseUrl()}/workitemtypes/${encodeURIComponent(name)}/fields?api-version=${API_VERSION}`, {
    headers: authHeaders(),
  });
  if (!fres.ok) throw new Error(await parseErrorBody(fres));
  const fields = new Set<string>(((await fres.json()).value ?? []).map((f: { referenceName: string }) => f.referenceName));
  storyTypeCache = { name, fields };
  return storyTypeCache;
}

type ExistingChild = { id: number; tags: string };

// Filhos atuais da Feature (id + tags), para casar com as histórias já enviadas.
async function listChildren(featureId: number): Promise<ExistingChild[]> {
  const res = await fetch(`${baseUrl()}/workitems/${featureId}?$expand=relations&api-version=${API_VERSION}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(await parseErrorBody(res));
  const relations: { rel: string; url: string }[] = (await res.json()).relations ?? [];
  const ids = relations
    .filter((r) => r.rel === "System.LinkTypes.Hierarchy-Forward")
    .map((r) => Number(r.url.split("/").pop()))
    .filter((n) => Number.isFinite(n));
  if (ids.length === 0) return [];
  const out: ExistingChild[] = [];
  for (let i = 0; i < ids.length; i += 150) {
    const chunk = ids.slice(i, i + 150);
    const r = await fetch(
      `${baseUrl()}/workitems?ids=${chunk.join(",")}&fields=System.Id,System.Tags&api-version=${API_VERSION}`,
      { headers: authHeaders() }
    );
    if (!r.ok) throw new Error(await parseErrorBody(r));
    for (const w of (await r.json()).value ?? []) {
      out.push({ id: w.id, tags: typeof w.fields?.["System.Tags"] === "string" ? w.fields["System.Tags"] : "" });
    }
  }
  return out;
}

function storyFieldOps(s: StoryForAzure, type: { fields: Set<string> }) {
  const hasAcceptance = type.fields.has(FIELD_ACCEPTANCE);
  const ops: { op: string; path: string; value: unknown }[] = [
    { op: "add", path: "/fields/System.Title", value: storyTitle(s) },
    { op: "add", path: "/fields/System.Description", value: buildStoryDescription(s, !hasAcceptance) },
  ];
  if (hasAcceptance) {
    ops.push({ op: "add", path: `/fields/${FIELD_ACCEPTANCE}`, value: buildAcceptanceCriteriaHtml(s.acceptanceCriteria) });
  }
  if (type.fields.has(FIELD_PRIORITY)) {
    ops.push({ op: "add", path: `/fields/${FIELD_PRIORITY}`, value: storyAzurePriority(s.priority) });
  }
  return ops;
}

// Cria (ou atualiza) cada história como filha da Feature. Devolve quantas
// foram criadas/atualizadas. Se uma falhar, as anteriores já estão no Azure e
// um novo envio continua de onde parou (casa pela tag).
export async function syncUserStories(featureId: number, stories: StoryForAzure[]) {
  assertConfigured();
  if (stories.length === 0) return { created: 0, updated: 0, typeName: null as string | null };

  const type = await getStoryType();
  const children = await listChildren(featureId);
  const byTag = new Map<string, number>();
  for (const c of children) {
    for (const tag of c.tags.split(";").map((t) => t.trim())) {
      if (tag.startsWith(STORY_TAG_PREFIX)) byTag.set(tag, c.id);
    }
  }

  const parentUrl = `https://dev.azure.com/${encodeURIComponent(ORG!)}/_apis/wit/workItems/${featureId}`;
  let created = 0;
  let updated = 0;

  // Poucas chamadas em paralelo (o servidor tem tempo limitado e o Azure limita a taxa).
  const CONCURRENCY = 4;
  for (let i = 0; i < stories.length; i += CONCURRENCY) {
    await Promise.all(
      stories.slice(i, i + CONCURRENCY).map(async (story) => {
        const tag = `${STORY_TAG_PREFIX}${story.id}`;
        const existingId = byTag.get(tag);
        const ops = storyFieldOps(story, type);
        if (existingId) {
          const res = await fetch(`${baseUrl()}/workitems/${existingId}?api-version=${API_VERSION}`, {
            method: "PATCH",
            headers: authHeaders({ "Content-Type": "application/json-patch+json" }),
            body: JSON.stringify(ops),
          });
          if (!res.ok) throw new Error(await parseErrorBody(res));
          updated++;
        } else {
          ops.push({ op: "add", path: "/fields/System.Tags", value: tag });
          ops.push({
            op: "add",
            path: "/relations/-",
            value: { rel: "System.LinkTypes.Hierarchy-Reverse", url: parentUrl },
          });
          const res = await fetch(`${baseUrl()}/workitems/$${encodeURIComponent(type.name)}?api-version=${API_VERSION}`, {
            method: "POST",
            headers: authHeaders({ "Content-Type": "application/json-patch+json" }),
            body: JSON.stringify(ops),
          });
          if (!res.ok) throw new Error(await parseErrorBody(res));
          created++;
        }
      })
    );
  }
  return { created, updated, typeName: type.name };
}


// ---------------------------------------------------------------------------
// Campos próprios da Feature (Regras de negócio, Critérios de aceite, Métricas)
// ---------------------------------------------------------------------------
// O processo do projeto pode ter campos específicos para cada parte do PRD.
// Procuramos pelo NOME que aparece na tela do Azure (em inglês ou português)
// e usamos o nome interno (referenceName) que o Azure atribuiu. Se algum não
// existir, a parte correspondente continua indo dentro da Description.

export type FeatureFieldRefs = { businessRules?: string; acceptanceCriteria?: string; successMetrics?: string };

function norm(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

const FIELD_NAMES: Record<keyof FeatureFieldRefs, string[]> = {
  businessRules: ["business rules", "regras de negocio"],
  acceptanceCriteria: ["acceptance criteria", "criterios de aceite"],
  successMetrics: ["success metrics", "metricas de sucesso"],
};

let featureFieldRefsCache: FeatureFieldRefs | null = null;

export async function getFeatureFieldRefs(): Promise<FeatureFieldRefs> {
  if (featureFieldRefsCache) return featureFieldRefsCache;
  assertConfigured();
  const res = await fetch(`${baseUrl()}/workitemtypes/Feature/fields?api-version=${API_VERSION}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await parseErrorBody(res));
  const fields: { name: string; referenceName: string }[] = (await res.json()).value ?? [];
  const refs: FeatureFieldRefs = {};
  for (const key of Object.keys(FIELD_NAMES) as (keyof FeatureFieldRefs)[]) {
    const found = fields.find((f) => FIELD_NAMES[key].includes(norm(f.name)));
    if (found) refs[key] = found.referenceName;
  }
  featureFieldRefsCache = refs;
  return refs;
}
