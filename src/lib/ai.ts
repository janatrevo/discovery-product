// Camada única de acesso a IA generativa (seção 20 da especificação:
// "LLM Orchestration" fina, roteando por modo). Toda chamada aqui:
// 1. Usa saída estruturada (JSON) quando o resultado alimenta uma entidade.
// 2. Cai em modo mock, claramente rotulado, quando GEMINI_API_KEY não está
//    configurada — para que o produto seja demonstrável sem chave real e
//    para nunca falhar silenciosamente fingindo ser dado real.
//
// Provedor: Google Gemini API (gratuito, sem cartão de crédito — ver
// aistudio.google.com/apikey). Chamada via REST simples (fetch), sem SDK,
// para não depender de mais uma biblioteca. Trocar de provedor no futuro
// (ex.: Ollama local) significa editar só este arquivo — o resto do app usa
// apenas as funções exportadas abaixo.

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";

export function isAiEnabled() {
  return Boolean(GEMINI_API_KEY);
}

type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };

async function callGemini(opts: {
  system: string;
  parts: GeminiPart[];
  maxTokens?: number;
  jsonMode?: boolean;
}): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: opts.parts }],
      systemInstruction: { parts: [{ text: opts.system }] },
      generationConfig: {
        maxOutputTokens: opts.maxTokens ?? 1200,
        ...(opts.jsonMode ? { responseMimeType: "application/json" } : {}),
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gemini API HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  const text =
    data?.candidates?.[0]?.content?.parts
      // Descarta qualquer parte marcada como "thought" (raciocínio interno) —
      // só a resposta final deve entrar no texto que vamos parsear.
      ?.filter((p: { thought?: boolean }) => !p.thought)
      ?.map((p: { text?: string }) => p.text ?? "")
      .join("") ?? "";
  if (!text) throw new Error("Resposta vazia da Gemini API.");
  return text;
}

// Extrai o primeiro objeto/array JSON balanceado da resposta do modelo.
// Mesmo com responseMimeType "application/json", alguns modelos ainda
// envolvem o JSON em cercas de markdown (```json ... ```) ou acrescentam
// texto depois — por isso não confiamos em JSON.parse(text) direto nem em
// regex guloso (que pode capturar chaves de sobra e quebrar o parse).
function parseJsonResponse<T>(rawText: string): T {
  const text = rawText
    .trim()
    .replace(/^```[a-zA-Z]*\n?/, "")
    .replace(/```\s*$/, "")
    .trim();

  // Tenta o caminho feliz primeiro: a resposta inteira já é JSON válido.
  try {
    return JSON.parse(text) as T;
  } catch {
    // segue para a extração manual abaixo
  }

  const start = text.search(/[[{]/);
  if (start === -1) throw new Error("Nenhum JSON encontrado na resposta da IA.");
  const openChar = text[start];
  const closeChar = openChar === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === openChar) depth++;
    else if (ch === closeChar) {
      depth--;
      if (depth === 0) return JSON.parse(text.slice(start, i + 1)) as T;
    }
  }
  throw new Error("JSON incompleto/malformado na resposta da IA.");
}

async function callStructured<T>(opts: {
  system: string;
  prompt: string;
  mock: T;
  maxTokens?: number;
}): Promise<{ data: T; isMock: boolean; modelVersion: string }> {
  if (!isAiEnabled()) {
    return { data: opts.mock, isMock: true, modelVersion: "mock-local-v1" };
  }
  try {
    const text = await callGemini({
      system: opts.system,
      parts: [{ text: opts.prompt }],
      maxTokens: opts.maxTokens,
      jsonMode: true,
    });
    const parsed = parseJsonResponse<T>(text);
    return { data: parsed, isMock: false, modelVersion: GEMINI_MODEL };
  } catch (err) {
    console.error("Erro ao chamar Gemini API, caindo para mock:", err);
    return { data: opts.mock, isMock: true, modelVersion: "mock-fallback-v1" };
  }
}

// ---------- Codificação qualitativa assistida (seção 11.2) ----------
export async function suggestCodes(transcript: string, existingCodeNames: string[]) {
  const mock: { excerpt: string; codeName: string; rationale: string }[] = [
    {
      excerpt: transcript.slice(0, Math.min(120, transcript.length)) || "Trecho de exemplo da transcrição",
      codeName: existingCodeNames[0] || "Fricção de onboarding",
      rationale: "[modo demo — sem GEMINI_API_KEY] sugestão ilustrativa, não analisou a transcrição de verdade.",
    },
  ];
  if (!transcript.trim()) return { data: [], isMock: true, modelVersion: "mock-local-v1" };
  return callStructured({
    system:
      "Você é um assistente de análise qualitativa de UX research. Analise a transcrição e sugira de 2 a 6 códigos temáticos, cada um com o trecho exato (excerpt) que o sustenta. Responda APENAS com um array JSON de objetos {excerpt, codeName, rationale}. Nunca invente trechos que não existam literalmente na transcrição.",
    prompt: `Códigos já existentes no projeto (reutilize quando fizer sentido): ${existingCodeNames.join(", ") || "nenhum ainda"}\n\nTranscrição:\n${transcript}`,
    mock,
  });
}

// ---------- AI Persona Simulation Engine (seção 14.1) ----------
export type SimulationPersonaInput = {
  id: string;
  name: string;
  shortDescription?: string | null;
  jtbdMain?: string | null;
  pains?: string[] | null;
  goals?: string[] | null;
  techFamiliarity?: string | null;
  characteristicLanguage?: string | null;
};

export async function simulatePersonaScenario(
  persona: SimulationPersonaInput,
  productDescription: string,
  scenario: string,
  task: string
) {
  const mock = {
    expectations: "[modo demo — configure GEMINI_API_KEY para simulação real] A persona esperaria encontrar uma forma rápida de concluir a tarefa.",
    understanding: "Entendimento parcial da proposta de valor.",
    doubts: "Dúvida sobre por onde começar.",
    trust_signals: "Nenhum sinal de confiança identificado no modo demo.",
    distrust_signals: "Nenhum sinal de desconfiança identificado no modo demo.",
    objections: ["Preço não está claro"],
    frustrations: ["Fluxo pode parecer longo"],
    usage_intent: "média",
    purchase_intent: "baixa — precisa de mais informação",
    barriers: ["Falta de clareza sobre o próximo passo"],
    relevant_features: [],
    unnecessary_features: [],
  };

  return callStructured({
    system:
      "Você está simulando exploratoriamente como UMA PERSONA especifica reagiria a um produto/cenário, para ajudar um time de produto a levantar hipóteses a investigar com pesquisa real. Isto é uma simulação, não um teste com usuário real — nunca afirme fatos de mercado, apenas explore a perspectiva da persona com base no perfil dado. Responda APENAS com um objeto JSON com as chaves: expectations, understanding, doubts, trust_signals, distrust_signals, objections (array), frustrations (array), usage_intent, purchase_intent, barriers (array), relevant_features (array), unnecessary_features (array).",
    prompt: `Persona: ${persona.name}\nDescrição: ${persona.shortDescription ?? ""}\nJTBD: ${persona.jtbdMain ?? ""}\nDores conhecidas: ${(persona.pains ?? []).join(", ")}\nObjetivos: ${(persona.goals ?? []).join(", ")}\nFamiliaridade tecnológica: ${persona.techFamiliarity ?? "desconhecida"}\nTom de linguagem: ${persona.characteristicLanguage ?? "neutro"}\n\nProduto/conceito: ${productDescription}\n\nCenário: ${scenario}\n\nTarefa: ${task}`,
    mock,
    maxTokens: 1200,
  });
}

// ---------- Usability/Image Testing multimodal (seção 15) ----------
export async function analyzeUsabilityImage(
  imageBase64: string,
  mediaType: string,
  persona: SimulationPersonaInput,
  scenario: string,
  task: string
) {
  const mock = {
    first_attention: "[modo demo] Provavelmente o elemento de maior contraste no topo da tela.",
    what_seems_important: "Título principal e botão de ação.",
    what_is_confusing: "Sem chave de API configurada — análise real não executada.",
    likely_action: "Clicar no botão mais destacado.",
    friction_points: ["Hierarquia visual pouco clara no modo demo"],
    cta_understood: "indeterminado (modo demo)",
    value_proposition_clear: "indeterminado (modo demo)",
    hierarchy_issues: [],
    accessibility_issues: [],
    trust_reducing_elements: [],
  };

  if (!isAiEnabled()) return { data: mock, isMock: true, modelVersion: "mock-local-v1" };

  try {
    const text = await callGemini({
      system:
        "Você está analisando uma imagem de interface (screenshot/wireframe/protótipo) sob a perspectiva de UMA PERSONA específica, para exploração de usabilidade. Isto é simulação, não teste de usabilidade real. Responda APENAS com um objeto JSON com as chaves: first_attention, what_seems_important, what_is_confusing, likely_action, friction_points (array), cta_understood, value_proposition_clear, hierarchy_issues (array), accessibility_issues (array), trust_reducing_elements (array).",
      parts: [
        { inlineData: { mimeType: mediaType, data: imageBase64 } },
        {
          text: `Persona: ${persona.name} — ${persona.shortDescription ?? ""}\nFamiliaridade tecnológica: ${persona.techFamiliarity ?? "desconhecida"}\nCenário: ${scenario}\nTarefa: ${task}`,
        },
      ],
      maxTokens: 1200,
      jsonMode: true,
    });
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : mock;
    return { data: parsed, isMock: false, modelVersion: GEMINI_MODEL };
  } catch (err) {
    console.error("Erro na análise multimodal, caindo para mock:", err);
    return { data: mock, isMock: true, modelVersion: "mock-fallback-v1" };
  }
}

// ---------- Explicação do Confidence Score em linguagem natural (seção 14.3) ----------
// Nunca decide o número — só explica um receipt já calculado deterministicamente.
export async function explainConfidence(receiptSummary: string, hypothesisTitle: string) {
  const mock = `[modo demo] O score foi calculado a partir das evidências vinculadas a "${hypothesisTitle}". Configure GEMINI_API_KEY para uma explicação em linguagem natural gerada por IA — os números do recibo já são reais e determinísticos independentemente disso.`;
  if (!isAiEnabled()) return { data: mock, isMock: true, modelVersion: "mock-local-v1" };
  try {
    const text = await callGemini({
      system:
        "Você explica em português, em 2-4 frases, por que um Confidence Score determinístico chegou a um certo valor, citando os fatores do recibo fornecido. Você NUNCA decide ou ajusta o número — apenas explica o que já foi calculado.",
      parts: [{ text: `Hipótese: ${hypothesisTitle}\nRecibo: ${receiptSummary}` }],
      maxTokens: 400,
    });
    return { data: text, isMock: false, modelVersion: GEMINI_MODEL };
  } catch (err) {
    console.error("Erro ao explicar confidence score, caindo para mock:", err);
    return { data: mock, isMock: true, modelVersion: "mock-fallback-v1" };
  }
}

// ---------- Síntese de painel multi-persona (comparação/divergência) ----------
// Quando uma rodada de simulação inclui mais de uma persona, compara as
// respostas para destacar consenso, divergência e um possível sinal de
// segmentação — a divergência entre personas é, sozinha, um sinal de
// discovery (pode indicar que "o usuário" não é um perfil único).
export type PersonaPanelInput = {
  personaName: string;
  data: Record<string, unknown>;
};

export async function synthesizePersonaPanel(panel: PersonaPanelInput[], scenario: string, task: string) {
  if (panel.length < 2) {
    return { data: null as null, isMock: false, modelVersion: "n/a" };
  }
  const mock = {
    consensus: ["[modo demo — sem GEMINI_API_KEY] síntese ilustrativa, não comparou as respostas de verdade."],
    divergence: ["Configure a chave para uma comparação real entre as personas."],
    segmentation_signal: "Indeterminado (modo demo).",
  };
  const panelSummary = panel
    .map((p, i) => `Persona ${i + 1} — ${p.personaName}:\n${JSON.stringify(p.data, null, 2)}`)
    .join("\n\n");
  return callStructured({
    system:
      "Você recebe as respostas simuladas de VÁRIAS personas ao mesmo cenário de produto. Compare-as e responda APENAS com um objeto JSON com as chaves: consensus (array de pontos em que as personas convergem), divergence (array de pontos em que elas divergem de forma relevante), segmentation_signal (1-2 frases sobre se essa divergência sugere que talvez sejam segmentos de usuário diferentes, não um único perfil). Baseie-se só no que está nas respostas fornecidas — não invente dados novos sobre as personas.",
    prompt: `Cenário: ${scenario}\nTarefa: ${task}\n\n${panelSummary}`,
    mock,
    maxTokens: 900,
  });
}

// ---------- Detecção de padrões entre hipóteses (Research Repository) ----------
// Cruza evidências REAIS de hipóteses diferentes procurando temas
// recorrentes que um time olhando cada hipótese isoladamente poderia não
// perceber. O resultado é sempre uma leitura interpretativa (inferência)
// sobre dados reais — nunca uma evidência nova por si só, e nunca gerado a
// partir de simulação (o chamador é responsável por filtrar originClass
// antes de montar `items`).
export type PatternEvidenceInput = {
  hypothesisTitle: string;
  evidenceType: string;
  content: string;
};

export type EvidencePattern = {
  title: string;
  description: string;
  relatedHypotheses: string[];
};

export async function detectEvidencePatterns(items: PatternEvidenceInput[]) {
  const mock: { patterns: EvidencePattern[] } = {
    patterns: [
      {
        title: "[modo demo — sem GEMINI_API_KEY] padrão ilustrativo",
        description: "Configure GEMINI_API_KEY para uma análise real cruzando as evidências do projeto.",
        relatedHypotheses: [],
      },
    ],
  };
  if (items.length < 2) {
    return { data: { patterns: [] as EvidencePattern[] }, isMock: false, modelVersion: "n/a" };
  }
  const summary = items
    .map((it, i) => `${i + 1}. [Hipótese: ${it.hypothesisTitle}] [${it.evidenceType}] ${it.content}`)
    .join("\n");
  return callStructured({
    system:
      'Você analisa evidências reais de pesquisa de produto vinculadas a hipóteses DIFERENTES de um mesmo projeto, procurando padrões e temas recorrentes que atravessam mais de uma hipótese — sinais que um time de produto poderia não perceber olhando cada hipótese isoladamente. Responda APENAS com um objeto JSON {"patterns": [{"title": string, "description": string, "relatedHypotheses": string[]}]}. Cada padrão deve citar pelo menos 2 hipóteses diferentes em relatedHypotheses (use o título exato da hipótese fornecido). Baseie-se apenas no conteúdo fornecido — nunca invente evidência que não esteja no texto. Se não houver padrão real cruzando hipóteses, responda com {"patterns": []}.',
    prompt: `Evidências reais do projeto (formato: hipótese, tipo, conteúdo):\n${summary}`,
    mock,
    maxTokens: 1200,
  });
}

// ---------- Rascunho de PRD & User Stories (Discovery Board → engenharia) ----------
// Gera um rascunho estruturado a partir do que JÁ foi validado no discovery
// (hipótese, evidência real vinculada, persona) — nunca inventa escopo novo;
// qualquer suposição sem lastro deve virar uma pergunta em aberto, não uma
// afirmação. O resultado é sempre um rascunho (generatedBy: ai_generated) —
// cabe a um humano revisar/editar antes de valer como PRD final.
export type ProductDocEvidenceInput = {
  type: string;
  content: string;
  favorable: boolean;
};

export type ProductDocInput = {
  opportunityTitle: string;
  opportunityDescription: string;
  problemRef: string;
  hypothesisTitle?: string;
  personaSummary?: string;
  evidence: ProductDocEvidenceInput[];
};

export type ProductDocDraft = {
  goals: string[];
  nonGoals: string[];
  openQuestions: string[];
  userStories: {
    asA: string;
    iWant: string;
    soThat: string;
    acceptanceCriteria: string[];
    priority: "must" | "should" | "could";
  }[];
};

export async function draftProductDoc(input: ProductDocInput) {
  const mock: ProductDocDraft = {
    goals: ["[modo demo — sem GEMINI_API_KEY] objetivo ilustrativo, não analisou a oportunidade de verdade."],
    nonGoals: ["Configure GEMINI_API_KEY para um rascunho real baseado na evidência vinculada."],
    openQuestions: ["Qual o critério de sucesso mensurável desta oportunidade?"],
    userStories: [
      {
        asA: "usuário",
        iWant: "[modo demo] realizar a tarefa principal desta oportunidade",
        soThat: "meu problema seja resolvido",
        acceptanceCriteria: ["Definir critério de aceite real ao configurar a chave da IA."],
        priority: "should",
      },
    ],
  };

  const evidenceSummary = input.evidence.length
    ? input.evidence
        .map((e, i) => `${i + 1}. [${e.favorable ? "favorável" : "contrária"}] [${e.type}] ${e.content}`)
        .join("\n")
    : "Nenhuma evidência real vinculada ainda.";

  return callStructured({
    system:
      'Você ajuda um time de produto a transformar uma oportunidade já validada em discovery em um rascunho de PRD. Baseie-se SOMENTE no problema, hipótese, persona e evidências fornecidos — nunca invente escopo, métricas ou fatos sobre o usuário que não estejam no material dado. Qualquer suposição necessária que não tenha lastro na evidência deve virar uma pergunta em "openQuestions", nunca uma afirmação disfarçada de fato. Responda APENAS com um objeto JSON {"goals": string[], "nonGoals": string[], "openQuestions": string[], "userStories": [{"asA": string, "iWant": string, "soThat": string, "acceptanceCriteria": string[], "priority": "must"|"should"|"could"}]}. Gere de 2 a 6 user stories.',
    prompt: `Oportunidade: ${input.opportunityTitle}\nDescrição: ${input.opportunityDescription}\nProblema observado: ${input.problemRef}\nHipótese de origem: ${input.hypothesisTitle ?? "nenhuma vinculada"}\nPersona: ${input.personaSummary ?? "nenhuma vinculada"}\n\nEvidências reais vinculadas à hipótese:\n${evidenceSummary}`,
    mock,
    maxTokens: 1600,
  });
}

// ---------- Recomendador de experimento (seção 12) — regras + explicação por IA ----------
const METHOD_RULES: Record<string, { method: string; why: string }[]> = {
  problem: [{ method: "interview", why: "Hipóteses de problema se investigam melhor com entrevistas exploratórias abertas." }],
  user_behavioral: [{ method: "interview", why: "Comportamento observado se entende melhor combinando entrevista com dado comportamental." }],
  solution: [{ method: "prototype_test", why: "Testar um protótipo revela se a solução resolve o problema na prática." }],
  value: [
    { method: "concept_test", why: "Teste de conceito mede percepção de valor antes de construir." },
    { method: "fake_door", why: "Fake door mede intenção real de uso/compra com baixo custo de construção." },
  ],
  usability: [{ method: "usability_test", why: "Hipóteses de usabilidade exigem observar alguém tentando realizar a tarefa." }],
  business_outcome: [{ method: "ab_test", why: "Resultado de negócio se valida comparando variantes com métrica clara." }],
  pricing: [{ method: "price_test", why: "Hipóteses de preço precisam de teste de preço estruturado (ex.: Van Westendorp)." }],
  acquisition_channel: [{ method: "landing_page", why: "Canal de aquisição se testa com landing page + tráfego real direcionado." }],
  retention_engagement: [{ method: "ab_test", why: "Retenção se mede longitudinalmente, idealmente com teste controlado." }],
  ecosystem_partnership: [{ method: "interview", why: "Parcerias se exploram inicialmente com entrevistas com o parceiro/canal." }],
};

export function recommendExperimentMethods(hypothesisType: string) {
  return METHOD_RULES[hypothesisType] ?? [{ method: "interview", why: "Método padrão de exploração inicial." }];
}
