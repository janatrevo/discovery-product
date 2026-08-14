/**
 * Seed de dados demo — popula um projeto fictício completo ("Trevo Saúde
 * App") cobrindo todos os módulos da plataforma, incluindo os fluxos de IA
 * (em modo mock quando ANTHROPIC_API_KEY não está configurada).
 *
 * Roda contra qualquer Postgres apontado por DATABASE_URL (local hoje,
 * Supabase depois — ver MIGRATING_TO_SUPABASE.md). É destrutivo: apaga todo
 * o conteúdo de negócio antes de semear (pensado para ambiente de demo/dev,
 * nunca rode contra produção).
 *
 * Uso: npx tsx scripts/seed.ts
 */
import { db } from "../src/db";
import { sql } from "drizzle-orm";
import { hashPassword } from "../src/lib/auth";
import { recomputeHypothesis } from "../src/lib/recompute-hypothesis";
import {
  organizations,
  users,
  projects,
  projectMemberships,
  personas,
  products,
  hypotheses,
  hypothesisPersonas,
  hypothesisProducts,
  hypothesisHistory,
  evidence,
  hypothesisEvidence,
  experiments,
  surveys,
  surveyQuestions,
  surveyResponses,
  surveyAnswers,
  interviewGuides,
  interviewGuideQuestions,
  interviews,
  codes,
  codedSegments,
  usabilityTests,
  usabilityTestAssets,
  usabilityTestPersonas,
  usabilityFindings,
  simulationRuns,
  simulationResponses,
  opportunities,
  decisions,
  reports,
} from "../src/db/schema";
import { computePriorityScore } from "../src/lib/priority-score";

function daysAgo(n: number) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

async function main() {
  console.log("Limpando dados de negócio existentes...");
  await db.execute(sql`TRUNCATE TABLE organizations, users, projects RESTART IDENTITY CASCADE`);

  console.log("Criando organização, usuário demo e projeto...");
  const [org] = await db.insert(organizations).values({ name: "Trevo Saúde" }).returning();

  const passwordHash = await hashPassword("Demo@2026!");
  const [demoUser] = await db
    .insert(users)
    .values({ name: "Time de Produto", email: "demo@trevosaude.com.br", passwordHash })
    .returning();

  const [project] = await db
    .insert(projects)
    .values({
      organizationId: org.id,
      name: "Trevo Saúde App",
      description:
        "App de teleconsulta e acompanhamento de pacientes crônicos, com integração a convênios. Projeto demo pré-carregado para explorar todos os módulos da plataforma.",
      createdBy: demoUser.id,
    })
    .returning();

  await db.insert(projectMemberships).values({ projectId: project.id, userId: demoUser.id, role: "owner" });

  // ---------- Personas ----------
  console.log("Criando personas...");
  const [marina] = await db
    .insert(personas)
    .values({
      projectId: project.id,
      name: "Marina, paciente crônica",
      origin: "research_based",
      shortDescription: "42 anos, hipertensa, faz acompanhamento trimestral, usa convênio empresarial.",
      jtbdMain: "Quando preciso de uma consulta de rotina, quero resolver sem perder meio dia de trabalho.",
      professionalContext: "Analista financeira, trabalha em horário comercial rígido.",
      personalContext: "Mãe de dois filhos, pouco tempo livre.",
      usageContext: "Agenda consultas do celular, geralmente à noite.",
      purchaseContext: "Não paga diretamente — depende de autorização do convênio.",
      techFamiliarity: "Média — usa apps bancários e de delivery sem dificuldade.",
      problemKnowledge: "Alta — já tentou teleconsulta em outro app e desistiu no meio.",
      solutionKnowledge: "Baixa — não conhece o Trevo ainda.",
      goals: ["Resolver consultas de rotina sem faltar ao trabalho", "Não perder o histórico entre consultas"],
      pains: ["Autorização do convênio demora ou falha", "Reagendar é um processo manual e lento"],
      frustrations: ["Preencher os mesmos dados em toda consulta"],
      needs: ["Confirmação clara de que a consulta está autorizada antes de aguardar"],
      motivations: ["Manter a pressão controlada sem depender de ir à clínica"],
      behaviors: ["Cancela e tenta remarcar quando o app trava no meio do fluxo"],
      fears: ["Ficar sem atendimento em uma emergência por burocracia"],
      objections: ["Já tive consulta cancelada de última hora por problema no convênio"],
      decisionCriteria: ["Rapidez", "Confirmação garantida"],
      priceSensitivity: "Baixa (custo é do convênio), mas alta sensibilidade a fricção.",
      realQuotes: ["Se eu soubesse que ia dar trabalho eu nem tentava de novo."],
      currentAlternatives: ["Ligar para a clínica", "App do convênio"],
      sources: ["Entrevista E1 — jul/2026"],
      completeness: 85,
      createdBy: demoUser.id,
    })
    .returning();

  const [drEduardo] = await db
    .insert(personas)
    .values({
      projectId: project.id,
      name: "Dr. Eduardo, clínico geral",
      origin: "research_based",
      shortDescription: "38 anos, atende 6-8 teleconsultas por dia, também atende presencial.",
      jtbdMain: "Quando atendo por telemedicina, quero manter a qualidade do prontuário sem gastar tempo extra.",
      professionalContext: "Atua em duas clínicas parceiras do convênio.",
      usageContext: "Usa a plataforma entre consultas presenciais, no computador da clínica.",
      techFamiliarity: "Alta.",
      goals: ["Preencher o prontuário rápido e sem retrabalho"],
      pains: ["Sistema atual exige preencher histórico do paciente do zero"],
      needs: ["Resumo rápido do histórico antes da consulta"],
      behaviors: ["Anota em papel quando o sistema é lento e depois transcreve"],
      objections: ["Já usei um resumo automático de outro sistema que errou informação clínica"],
      sources: ["Entrevista E2 — ago/2026", "Sombra de atendimento — ago/2026"],
      completeness: 70,
      createdBy: demoUser.id,
    })
    .returning();

  const [beatriz] = await db
    .insert(personas)
    .values({
      projectId: project.id,
      name: "Beatriz, coordenadora de convênio",
      origin: "synthetic",
      shortDescription:
        "Persona sintética (gerada por IA a partir de entrevistas com outras coordenadoras) — ainda sem entrevista direta.",
      jtbdMain: "Quando aprovo autorizações de teleconsulta, quero garantir conformidade sem virar gargalo.",
      goals: ["Reduzir volume de exceções manuais"],
      pains: ["Integrações incompletas geram retrabalho de auditoria"],
      sources: ["Persona sintética — gerada por IA em 2026-07, nunca entrevistada diretamente"],
      completeness: 40,
      createdBy: demoUser.id,
    })
    .returning();

  // ---------- Produtos ----------
  console.log("Criando produtos/conceitos...");
  const [appTeleconsulta] = await db
    .insert(products)
    .values({
      projectId: project.id,
      name: "Trevo App — Teleconsulta",
      description: "App principal de agendamento e realização de teleconsultas para pacientes e médicos.",
      category: "Telemedicina",
      problemSolved: "Acesso rápido a consultas de rotina sem deslocamento.",
      targetAudience: "Pacientes de convênios parceiros com condições crônicas.",
      valueProposition: "Consulta autorizada e confirmada em minutos, sem burocracia visível ao paciente.",
      features: ["Agendamento", "Chamada de vídeo", "Prontuário eletrônico", "Autorização automática de convênio"],
      benefits: ["Menos faltas ao trabalho", "Continuidade de cuidado"],
      differentiators: ["Autorização de convênio integrada em tempo real"],
      limitations: ["Depende de integração ativa com cada convênio parceiro"],
      price: "Sem custo direto ao paciente (coberto pelo convênio)",
      businessModel: "B2B2C — cobrança por consulta ao convênio parceiro",
      competitors: ["Concorrente A (teleconsulta genérica)", "App do próprio convênio"],
      version: "v1",
      createdBy: demoUser.id,
    })
    .returning();

  await db.insert(products).values({
    projectId: project.id,
    name: "Trevo Convênio Connect",
    description: "Camada de integração B2B para automatizar autorizações com sistemas de convênios parceiros.",
    category: "Integração B2B",
    problemSolved: "Autorização manual e lenta de procedimentos de telemedicina.",
    targetAudience: "Equipes de operações de convênios parceiros.",
    features: ["Webhook de autorização", "Painel de exceções"],
    version: "v0 (conceito)",
    createdBy: demoUser.id,
  });

  // ---------- Hipóteses ----------
  console.log("Criando hipóteses...");
  const [h1] = await db
    .insert(hypotheses)
    .values({
      projectId: project.id,
      title: "Pacientes com condições crônicas abandonam o agendamento por burocracia de autorização do convênio",
      description:
        "Acreditamos que parte relevante do abandono no funil de agendamento acontece na etapa de autorização do convênio, não na escolha do horário.",
      type: "problem",
      problemRef: "Funil de agendamento — etapa 'autorização do convênio'",
      context: "Observado após reclamações recorrentes em NPS baixo do app atual.",
      validationMethod: "Entrevistas + survey quantitativo + dado comportamental de funil",
      ownerId: demoUser.id,
      createdBy: demoUser.id,
    })
    .returning();

  const [h2] = await db
    .insert(hypotheses)
    .values({
      projectId: project.id,
      title: "Pacientes estão dispostos a pagar um plano anual com desconto para monitoramento contínuo",
      description: "Testando disposição a pagar por um plano complementar de acompanhamento entre consultas.",
      type: "pricing",
      problemRef: "Monetização direta ao paciente (hoje 100% B2B2C via convênio)",
      validationMethod: "Entrevistas de disposição a pagar + survey de intenção de compra",
      ownerId: demoUser.id,
      createdBy: demoUser.id,
    })
    .returning();

  const [h3] = await db
    .insert(hypotheses)
    .values({
      projectId: project.id,
      title: "Médicos conseguem preencher o prontuário em menos de 3 minutos usando a nova tela de teleconsulta",
      description: "Hipótese de usabilidade sobre o redesenho da tela de atendimento.",
      type: "usability",
      validationMethod: "Teste de usabilidade moderado com médicos",
      ownerId: demoUser.id,
      createdBy: demoUser.id,
    })
    .returning();

  const [h4] = await db
    .insert(hypotheses)
    .values({
      projectId: project.id,
      title: "Um assistente de IA que resume o histórico do paciente antes da consulta reduz o tempo de preparo do médico",
      description:
        "Hipótese de solução ainda não testada com usuários reais — exploramos apenas via simulação de IA e um teste de imagem/wireframe.",
      type: "solution",
      validationMethod: "A definir — ainda em fase de exploração via simulação, requer teste real antes de qualquer decisão.",
      ownerId: demoUser.id,
      createdBy: demoUser.id,
    })
    .returning();

  const [h5] = await db
    .insert(hypotheses)
    .values({
      projectId: project.id,
      title: "Lembretes push aumentam a adesão a consultas de retorno",
      description: "Hipótese de retenção/engajamento sobre o canal de lembrete usado hoje.",
      type: "retention_engagement",
      validationMethod: "Dado comportamental (funil de lembrete → comparecimento) + survey",
      ownerId: demoUser.id,
      createdBy: demoUser.id,
    })
    .returning();

  await db.insert(hypothesisPersonas).values([
    { hypothesisId: h1.id, personaId: marina.id },
    { hypothesisId: h2.id, personaId: marina.id },
    { hypothesisId: h3.id, personaId: drEduardo.id },
    { hypothesisId: h4.id, personaId: drEduardo.id },
    { hypothesisId: h5.id, personaId: marina.id },
  ]);
  await db.insert(hypothesisProducts).values([
    { hypothesisId: h1.id, productId: appTeleconsulta.id },
    { hypothesisId: h2.id, productId: appTeleconsulta.id },
    { hypothesisId: h3.id, productId: appTeleconsulta.id },
    { hypothesisId: h4.id, productId: appTeleconsulta.id },
  ]);

  // ---------- Evidência real (H1 — caminho para "Validated") ----------
  console.log("Criando evidências e recalculando confiança...");
  const [h1Interview, h1Survey, h1Experiment, h1Behavioral] = await db
    .insert(evidence)
    .values([
      {
        projectId: project.id,
        source: "Entrevista com Marina (E1)",
        type: "interview",
        evidenceDate: daysAgo(20),
        personaId: marina.id,
        context: "Entrevista de discovery sobre o funil de agendamento",
        content:
          "Marina relatou ter desistido de remarcar uma teleconsulta após duas tentativas de autorização falharem sem explicação clara.",
        qualityScore: 85,
        reliabilityScore: 85,
        sampleSize: 8,
        originClass: "real_data",
        originMethod: "Entrevista semiestruturada",
        generatedBy: "human",
        createdBy: demoUser.id,
      },
      {
        projectId: project.id,
        source: "Survey de abandono de agendamento — jul/2026",
        type: "survey",
        evidenceDate: daysAgo(15),
        personaId: marina.id,
        content:
          "68% dos respondentes que abandonaram o agendamento citaram 'demora ou falha na autorização do convênio' como principal motivo.",
        qualityScore: 85,
        reliabilityScore: 85,
        sampleSize: 70,
        originClass: "real_data",
        originMethod: "Survey quantitativo via link público",
        generatedBy: "human",
        createdBy: demoUser.id,
      },
      {
        projectId: project.id,
        source: "Experimento: autorização assíncrona pré-agendamento",
        type: "experiment",
        evidenceDate: daysAgo(10),
        content:
          "Grupo de teste com autorização verificada antes da confirmação do horário teve 22 p.p. menos abandono que o grupo controle.",
        qualityScore: 90,
        reliabilityScore: 90,
        sampleSize: 200,
        originClass: "real_data",
        originMethod: "Experimento controlado (A/B)",
        generatedBy: "human",
        createdBy: demoUser.id,
      },
      {
        projectId: project.id,
        source: "Analytics de funil de agendamento — últimos 90 dias",
        type: "behavioral",
        evidenceDate: daysAgo(5),
        content:
          "A etapa 'autorização do convênio' concentra 61% dos abandonos do funil de agendamento, muito acima de qualquer outra etapa.",
        qualityScore: 90,
        reliabilityScore: 90,
        sampleSize: 5000,
        originClass: "real_data",
        originMethod: "Dado comportamental de produto (funil instrumentado)",
        generatedBy: "human",
        createdBy: demoUser.id,
      },
    ])
    .returning();

  await db.insert(hypothesisEvidence).values([
    { hypothesisId: h1.id, evidenceId: h1Interview.id, favorable: true },
    { hypothesisId: h1.id, evidenceId: h1Survey.id, favorable: true },
    { hypothesisId: h1.id, evidenceId: h1Experiment.id, favorable: true },
    { hypothesisId: h1.id, evidenceId: h1Behavioral.id, favorable: true },
  ]);
  await recomputeHypothesis(h1.id, demoUser.id);

  // ---------- Evidência mista (H2 — "Partially Validated") ----------
  const [h2Interview, h2Survey] = await db
    .insert(evidence)
    .values([
      {
        projectId: project.id,
        source: "Entrevista de disposição a pagar — Marina",
        type: "interview",
        evidenceDate: daysAgo(12),
        personaId: marina.id,
        content: "Marina disse que pagaria um valor pequeno mensal se isso garantisse resposta rápida do médico entre consultas.",
        qualityScore: 75,
        reliabilityScore: 70,
        sampleSize: 6,
        originClass: "real_data",
        originMethod: "Entrevista de disposição a pagar",
        generatedBy: "human",
        createdBy: demoUser.id,
      },
      {
        projectId: project.id,
        source: "Survey de intenção de compra — plano anual",
        type: "survey",
        evidenceDate: daysAgo(8),
        content: "Apenas 24% dos respondentes marcaram 'provavelmente pagaria' ou acima para o plano anual proposto.",
        qualityScore: 70,
        reliabilityScore: 65,
        sampleSize: 40,
        originClass: "real_data",
        originMethod: "Survey quantitativo (pergunta de intenção de compra)",
        generatedBy: "human",
        createdBy: demoUser.id,
      },
    ])
    .returning();

  await db.insert(hypothesisEvidence).values([
    { hypothesisId: h2.id, evidenceId: h2Interview.id, favorable: true },
    { hypothesisId: h2.id, evidenceId: h2Survey.id, favorable: false },
  ]);
  await recomputeHypothesis(h2.id, demoUser.id);

  // ---------- Evidência insuficiente (H3 — "Investigating") ----------
  const [h3Usability] = await db
    .insert(evidence)
    .values([
      {
        projectId: project.id,
        source: "Teste de usabilidade moderado — protótipo de prontuário",
        type: "usability_test",
        evidenceDate: daysAgo(4),
        personaId: drEduardo.id,
        content:
          "Em 1 de 4 sessões o médico levou mais de 5 minutos e reportou confusão com a navegação entre abas — amostra pequena, resultado ainda inconclusivo.",
        qualityScore: 60,
        reliabilityScore: 60,
        sampleSize: 4,
        originClass: "real_data",
        originMethod: "Teste de usabilidade moderado",
        generatedBy: "human",
        createdBy: demoUser.id,
      },
    ])
    .returning();

  await db.insert(hypothesisEvidence).values([{ hypothesisId: h3.id, evidenceId: h3Usability.id, favorable: false }]);
  await recomputeHypothesis(h3.id, demoUser.id);

  // ---------- Evidência contrária forte (H5 — "Invalidated", depois override) ----------
  const [h5Behavioral, h5Survey] = await db
    .insert(evidence)
    .values([
      {
        projectId: project.id,
        source: "Analytics: lembrete push vs. comparecimento em retorno",
        type: "behavioral",
        evidenceDate: daysAgo(6),
        content: "Coorte com lembrete push teve taxa de comparecimento estatisticamente igual à coorte sem lembrete (diferença de 0,4 p.p.).",
        qualityScore: 85,
        reliabilityScore: 85,
        sampleSize: 3000,
        originClass: "real_data",
        originMethod: "Análise de coorte comportamental",
        generatedBy: "human",
        createdBy: demoUser.id,
      },
      {
        projectId: project.id,
        source: "Survey de canais de lembrete preferidos",
        type: "survey",
        evidenceDate: daysAgo(6),
        content: "Apenas 12% dos respondentes disseram notar ou agir sobre notificações push do app; a maioria prefere SMS ou WhatsApp.",
        qualityScore: 80,
        reliabilityScore: 75,
        sampleSize: 45,
        originClass: "real_data",
        originMethod: "Survey quantitativo",
        generatedBy: "human",
        createdBy: demoUser.id,
      },
    ])
    .returning();

  await db.insert(hypothesisEvidence).values([
    { hypothesisId: h5.id, evidenceId: h5Behavioral.id, favorable: false },
    { hypothesisId: h5.id, evidenceId: h5Survey.id, favorable: false },
  ]);
  await recomputeHypothesis(h5.id, demoUser.id);

  // Override manual — decisão do time de continuar investigando com outro canal
  // em vez de simplesmente descartar a hipótese de retenção via lembrete.
  const [h5Current] = await db.select().from(hypotheses).where(sql`id = ${h5.id}`).limit(1);
  await db
    .update(hypotheses)
    .set({
      status: "investigating",
      statusOverridden: true,
      statusOverrideReason:
        "Evidência indica que push não funciona, mas o time quer testar SMS/WhatsApp antes de descartar a hipótese de que lembretes (em algum canal) aumentam adesão.",
      updatedAt: new Date(),
    })
    .where(sql`id = ${h5.id}`);
  await db.insert(hypothesisHistory).values({
    hypothesisId: h5.id,
    fieldChanged: "status",
    oldValue: h5Current.status,
    newValue: "investigating",
    note: "Override manual — time decidiu re-testar com canal diferente (SMS) antes de invalidar definitivamente.",
    isOverride: true,
    changedBy: demoUser.id,
  });

  // ---------- Experimentos ----------
  console.log("Criando experimentos...");
  await db.insert(experiments).values([
    {
      projectId: project.id,
      hypothesisId: h1.id,
      objective: "Validar se autorização assíncrona pré-agendamento reduz abandono",
      personaId: marina.id,
      variable: "Momento da verificação de autorização (antes vs. depois da escolha do horário)",
      method: "ab_test",
      metric: "Taxa de abandono no funil de agendamento",
      successCriteria: "Redução de pelo menos 10 p.p. no abandono do grupo de teste vs. controle",
      successCriteriaLockedAt: daysAgo(25),
      samplePlanned: 200,
      sampleActual: 200,
      resultExpected: "Redução de abandono ao remover a incerteza de autorização durante a escolha do horário",
      resultObserved: "Redução de 22 p.p. no abandono do grupo de teste",
      conclusion: "Hipótese fortemente suportada — priorizar o redesenho do fluxo de autorização.",
      nextStep: "Levar para todos os usuários e mapear como oportunidade no Discovery Board",
      status: "completed",
      resultRecordedAt: daysAgo(9),
      createdBy: demoUser.id,
    },
    {
      projectId: project.id,
      hypothesisId: h3.id,
      objective: "Medir tempo de preenchimento de prontuário no novo layout",
      personaId: drEduardo.id,
      variable: "Layout da tela de atendimento (atual vs. proposto)",
      method: "usability_test",
      metric: "Tempo até salvar o prontuário",
      successCriteria: "Ao menos 80% das sessões abaixo de 3 minutos",
      samplePlanned: 8,
      sampleActual: 4,
      resultExpected: "Redução de tempo por eliminar navegação entre abas",
      resultObserved: "1 de 4 sessões acima de 5 minutos por confusão de navegação — amostra insuficiente para conclusão",
      conclusion: "Inconclusivo com a amostra atual — ampliar para 8 médicos antes de decidir",
      nextStep: "Recrutar mais 4 médicos e simplificar a navegação testada",
      status: "in_progress",
      createdBy: demoUser.id,
    },
  ]);

  // ---------- Survey completo (com pergunta tendenciosa sinalizada) ----------
  console.log("Criando survey...");
  const [survey] = await db
    .insert(surveys)
    .values({
      projectId: project.id,
      hypothesisId: h2.id,
      title: "Intenção de compra — plano anual de monitoramento",
      objective: "Medir disposição a pagar por um plano complementar de acompanhamento contínuo.",
      targetAudience: "Pacientes crônicos ativos no app nos últimos 6 meses",
      sampleTarget: 50,
      status: "closed",
      publicSlug: "plano-anual-2026",
      createdBy: demoUser.id,
    })
    .returning();

  const [q1, q2, q3] = await db
    .insert(surveyQuestions)
    .values([
      {
        surveyId: survey.id,
        orderIndex: 0,
        questionText: "Você não acha que seria ótimo ter um acompanhamento contínuo com desconto, não é mesmo?",
        questionType: "single_choice",
        options: ["Sim", "Não", "Talvez"],
        leadingFlag: true,
        leadingFlagNote:
          "Pergunta tendenciosa — assume a resposta desejada ('não acha que seria ótimo'). Reescrever de forma neutra antes de reutilizar.",
      },
      {
        surveyId: survey.id,
        orderIndex: 1,
        questionText: "Qual a probabilidade de você assinar um plano anual de monitoramento contínuo com 15% de desconto?",
        questionType: "purchase_intent",
        options: [],
      },
      {
        surveyId: survey.id,
        orderIndex: 2,
        questionText: "Qual canal você prefere para lembretes de consulta?",
        questionType: "single_choice",
        options: ["WhatsApp", "SMS", "Notificação push", "E-mail"],
      },
    ])
    .returning();

  const responseValues = [
    { q1: "Sim", q2: 4, q3: "WhatsApp" },
    { q1: "Talvez", q2: 3, q3: "SMS" },
    { q1: "Não", q2: 2, q3: "WhatsApp" },
    { q1: "Sim", q2: 5, q3: "SMS" },
    { q1: "Talvez", q2: 2, q3: "WhatsApp" },
    { q1: "Não", q2: 1, q3: "E-mail" },
  ];
  for (const [i, r] of responseValues.entries()) {
    const [resp] = await db
      .insert(surveyResponses)
      .values({ surveyId: survey.id, respondentRef: `respondente-${i + 1}` })
      .returning();
    await db.insert(surveyAnswers).values([
      { responseId: resp.id, questionId: q1.id, answerValue: r.q1 },
      { responseId: resp.id, questionId: q2.id, answerValue: r.q2 },
      { responseId: resp.id, questionId: q3.id, answerValue: r.q3 },
    ]);
  }

  // ---------- Entrevista qualitativa com codificação ----------
  console.log("Criando guia de entrevista, entrevista e códigos...");
  const [guide] = await db
    .insert(interviewGuides)
    .values({
      projectId: project.id,
      hypothesisId: h1.id,
      title: "Roteiro — Fricção no agendamento de teleconsulta",
      objective: "Entender onde e por que pacientes desistem do agendamento",
      scenario: "Paciente que tentou agendar uma teleconsulta no último mês",
      jtbdContext: "Precisa de uma consulta de rotina e tenta agendar pelo app",
      jtbdMotivation: "Evitar deslocamento e falta ao trabalho",
      jtbdObstacle: "Processo de autorização do convênio",
      jtbdExpectedOutcome: "Consulta confirmada rapidamente",
      createdBy: demoUser.id,
    })
    .returning();

  await db.insert(interviewGuideQuestions).values([
    { guideId: guide.id, orderIndex: 0, questionText: "Me conte sobre a última vez que você tentou agendar uma consulta pelo app." },
    { guideId: guide.id, orderIndex: 1, questionText: "O que aconteceu depois que você escolheu o horário?" },
    { guideId: guide.id, orderIndex: 2, questionText: "Em algum momento você desistiu ou pensou em desistir? Por quê?", isFollowup: true },
  ]);

  const [interview] = await db
    .insert(interviews)
    .values({
      projectId: project.id,
      guideId: guide.id,
      personaId: marina.id,
      intervieweeRef: "Marina S. (paciente crônica)",
      interviewDate: daysAgo(20),
      transcript:
        "Entrevistador: Me conte sobre a última vez que você tentou agendar uma consulta.\n" +
        "Marina: Eu escolhi o horário certinho, mas depois fiquei esperando a autorização do convênio e nada. Liguei pro suporte e disseram que estava 'em análise'.\n" +
        "Entrevistador: E o que você fez?\n" +
        "Marina: Tentei de novo dois dias depois. Aí desisti e liguei direto pra clínica, do jeito antigo mesmo.\n" +
        "Entrevistador: Se isso não tivesse acontecido, você teria continuado usando o app?\n" +
        "Marina: Ah, sim, é bem mais prático quando funciona.",
      createdBy: demoUser.id,
    })
    .returning();

  const [codeFriction, codeTrust] = await db
    .insert(codes)
    .values([
      { projectId: project.id, name: "Fricção de autorização", color: "#f97316" },
      { projectId: project.id, name: "Confiança no app", color: "#22c55e" },
    ])
    .returning();

  await db.insert(codedSegments).values([
    {
      interviewId: interview.id,
      codeId: codeFriction.id,
      excerpt: "fiquei esperando a autorização do convênio e nada",
      aiSuggested: false,
      confirmed: true,
      isRepresentativeQuote: true,
      createdBy: demoUser.id,
    },
    {
      interviewId: interview.id,
      codeId: codeTrust.id,
      excerpt: "é bem mais prático quando funciona",
      aiSuggested: true,
      confirmed: false,
      isRepresentativeQuote: false,
      createdBy: demoUser.id,
    },
  ]);

  // ---------- Teste de usabilidade / imagem ----------
  console.log("Criando teste de usabilidade (imagem)...");
  const [usabilityTest] = await db
    .insert(usabilityTests)
    .values({
      projectId: project.id,
      hypothesisId: h4.id,
      title: "Wireframe — tela de agendamento com resumo de IA para o médico",
      scenario: "Médico abre a tela de teleconsulta e vê um resumo automático do histórico do paciente.",
      task: "Avalie se o resumo ajudaria a reduzir o tempo de preparo antes da consulta.",
      createdBy: demoUser.id,
    })
    .returning();

  await db.insert(usabilityTestAssets).values({
    usabilityTestId: usabilityTest.id,
    assetType: "image",
    url: "/uploads/usability/demo-agendamento-wireframe.png",
    filename: "demo-agendamento-wireframe.png",
  });
  await db.insert(usabilityTestPersonas).values({ usabilityTestId: usabilityTest.id, personaId: drEduardo.id });

  await db.insert(usabilityFindings).values([
    {
      usabilityTestId: usabilityTest.id,
      screenRef: "demo-agendamento-wireframe.png",
      problem: "[MODO DEMO] O resumo de IA aparece abaixo da dobra — o médico pode não notá-lo antes de iniciar a chamada.",
      personaId: drEduardo.id,
      severity: "medium",
      hypothesisId: h4.id,
      recommendation: "Mover o resumo para o topo da tela, antes do botão de iniciar chamada.",
      humanConfirmed: false,
      originClass: "simulation",
      generatedBy: "ai_generated",
    },
    {
      usabilityTestId: usabilityTest.id,
      screenRef: "demo-agendamento-wireframe.png",
      problem: "[MODO DEMO] Não há indicação de que o resumo foi gerado por IA — risco de o médico confiar demais sem revisar.",
      personaId: drEduardo.id,
      severity: "high",
      hypothesisId: h4.id,
      recommendation: "Adicionar rótulo explícito 'resumo gerado por IA — revise antes de decidir' no topo do card.",
      humanConfirmed: false,
      originClass: "simulation",
      generatedBy: "ai_generated",
    },
  ]);

  // ---------- Simulação de persona (mock, já que não há ANTHROPIC_API_KEY) ----------
  console.log("Criando simulação de cenário (mock)...");
  const [simRun] = await db
    .insert(simulationRuns)
    .values({
      projectId: project.id,
      hypothesisId: h4.id,
      mode: "scenario",
      personaIds: [drEduardo.id],
      productId: appTeleconsulta.id,
      scenario: "Médico inicia a teleconsulta e vê um resumo do histórico do paciente gerado por IA.",
      task: "Reagir como a persona reagiria ao ver esse resumo pela primeira vez.",
      promptSnapshot: "[prompt registrado no momento da simulação — ver simulation_responses]",
      modelVersion: "mock-demo-v1",
      isMock: true,
      createdBy: demoUser.id,
    })
    .returning();

  await db.insert(simulationResponses).values({
    simulationRunId: simRun.id,
    personaId: drEduardo.id,
    responseJson: {
      expectations: "Espera que o resumo seja preciso e rápido de revisar.",
      understanding: "Entende que é um resumo gerado automaticamente a partir do histórico.",
      doubts: "Terá que revisar cada informação antes de confiar nela?",
      trust_signals: "Fontes do histórico citadas dentro do resumo.",
      distrust_signals: "Nenhuma indicação visível de que o conteúdo foi gerado por IA.",
      objections: ["Já vi resumo automático errar informação clínica antes"],
      frustrations: ["Precisar validar manualmente reduz o ganho de tempo prometido"],
      usage_intent: "Usaria, mas revisando manualmente no início.",
      purchase_intent: "N/A — funcionalidade incluída no plano atual.",
      barriers: ["Falta de rótulo de proveniência do conteúdo gerado por IA"],
    },
    rawText: "[MODO DEMO] Resposta simulada ilustrativa — não gerada por um modelo de linguagem real nesta instância.",
  });

  // ---------- Oportunidades ----------
  console.log("Criando oportunidades...");
  const [h1Fresh] = await db.select().from(hypotheses).where(sql`id = ${h1.id}`).limit(1);
  const [h2Fresh] = await db.select().from(hypotheses).where(sql`id = ${h2.id}`).limit(1);

  const o1Scores = { impact: 5, frequency: 5, severity: 4, businessPotential: 4, solutionEase: 3 };
  const o1EvidenceConfidence = Number(h1Fresh.confidenceScore ?? 0);
  const [opp1] = await db
    .insert(opportunities)
    .values({
      projectId: project.id,
      hypothesisId: h1.id,
      personaId: marina.id,
      title: "Redesenhar o fluxo de autorização do convênio no agendamento",
      description: "Verificar autorização antes da escolha do horário, com status claro para o paciente.",
      problemRef: "61% dos abandonos do funil de agendamento acontecem na etapa de autorização",
      ...o1Scores,
      evidenceConfidence: Math.round(o1EvidenceConfidence),
      priorityScore: String(computePriorityScore({ ...o1Scores, evidenceConfidence: o1EvidenceConfidence })),
      status: "prioritized",
      createdBy: demoUser.id,
    })
    .returning();

  const o2Scores = { impact: 3, frequency: 3, severity: 2, businessPotential: 4, solutionEase: 4 };
  const o2EvidenceConfidence = Number(h2Fresh.confidenceScore ?? 0);
  await db.insert(opportunities).values({
    projectId: project.id,
    hypothesisId: h2.id,
    personaId: marina.id,
    title: "Testar plano anual com posicionamento de valor diferente",
    description: "Intenção de compra baixa com o posicionamento atual — testar variações de proposta antes de descartar.",
    ...o2Scores,
    evidenceConfidence: Math.round(o2EvidenceConfidence),
    priorityScore: String(computePriorityScore({ ...o2Scores, evidenceConfidence: o2EvidenceConfidence })),
    status: "new",
    createdBy: demoUser.id,
  });

  const o3Scores = { impact: 3, frequency: 4, severity: 2, businessPotential: 2, solutionEase: 5 };
  await db.insert(opportunities).values({
    projectId: project.id,
    personaId: drEduardo.id,
    title: "Simplificar navegação por abas na tela de atendimento",
    description: "Ajuste de usabilidade identificado no teste moderado com médicos — baixo esforço, alto ganho de fricção.",
    ...o3Scores,
    evidenceConfidence: 0,
    priorityScore: String(computePriorityScore({ ...o3Scores, evidenceConfidence: 0 })),
    status: "in_progress",
    createdBy: demoUser.id,
  });

  // ---------- Decisões ----------
  console.log("Criando decisões...");
  await db.insert(decisions).values([
    {
      projectId: project.id,
      decisionText: "Vamos priorizar o redesenho do fluxo de autorização do convênio no próximo ciclo.",
      rationale:
        "Evidência convergente de 4 fontes independentes (entrevista, survey, experimento controlado e dado comportamental) aponta a autorização como o principal ponto de abandono. Confidence Score da hipótese: " +
        (h1Fresh.confidenceScore ?? "—") +
        ".",
      opportunityId: opp1.id,
      hypothesisRefs: [h1.id],
      evidenceRefs: [h1Interview.id, h1Survey.id, h1Experiment.id, h1Behavioral.id],
      overriddenMethodology: false,
      decidedBy: demoUser.id,
      decidedAt: daysAgo(3),
    },
    {
      projectId: project.id,
      decisionText: "Vamos re-testar lembretes de consulta via SMS/WhatsApp antes de descartar a hipótese de retenção por lembrete.",
      rationale:
        "O dado comportamental invalida lembretes via push especificamente, não a hipótese de que algum lembrete aumenta adesão. Decidimos continuar investigando com outro canal em vez de seguir a recomendação automática de invalidar.",
      hypothesisRefs: [h5.id],
      evidenceRefs: [h5Behavioral.id, h5Survey.id],
      overriddenMethodology: true,
      decidedBy: demoUser.id,
      decidedAt: daysAgo(2),
    },
  ]);

  // ---------- Relatório ----------
  console.log("Gerando relatório inicial...");
  const [h3Fresh] = await db.select().from(hypotheses).where(sql`id = ${h3.id}`).limit(1);
  const [h4Fresh] = await db.select().from(hypotheses).where(sql`id = ${h4.id}`).limit(1);
  const [h5Fresh] = await db.select().from(hypotheses).where(sql`id = ${h5.id}`).limit(1);
  const allHyp = [h1Fresh, h2Fresh, h3Fresh, h4Fresh, h5Fresh];
  const allEvidence = [h1Interview, h1Survey, h1Experiment, h1Behavioral, h2Interview, h2Survey, h3Usability, h5Behavioral, h5Survey];
  const allOpportunities = await db.select().from(opportunities).where(sql`project_id = ${project.id}`);
  const allDecisions = await db.select().from(decisions).where(sql`project_id = ${project.id}`);

  const byStatus: Record<string, number> = {};
  for (const h of allHyp) byStatus[h.status] = (byStatus[h.status] ?? 0) + 1;
  const simCount = allEvidence.filter((e) => e.originClass === "simulation").length;
  const simPct = allEvidence.length > 0 ? Math.round((simCount / allEvidence.length) * 100) : 0;

  await db.insert(reports).values({
    projectId: project.id,
    title: "Status de discovery — carga inicial (demo)",
    scope: { type: "full_project" },
    content: {
      generatedAt: new Date().toISOString(),
      projectName: project.name,
      summary: {
        totalHypotheses: allHyp.length,
        byStatus,
        totalEvidence: allEvidence.length,
        simulationOnlyEvidencePct: simPct,
        totalOpportunities: allOpportunities.length,
        totalDecisions: allDecisions.length,
      },
      hypotheses: allHyp.map((h) => ({
        title: h.title,
        type: h.type,
        status: h.status,
        confidenceScore: h.confidenceScore,
        statusOverridden: h.statusOverridden,
      })),
      opportunities: allOpportunities
        .slice()
        .sort((a, b) => Number(b.priorityScore ?? 0) - Number(a.priorityScore ?? 0))
        .map((o) => ({ title: o.title, status: o.status, priorityScore: o.priorityScore, evidenceConfidence: o.evidenceConfidence })),
      decisions: allDecisions.map((d) => ({
        decisionText: d.decisionText,
        rationale: d.rationale,
        decidedAt: d.decidedAt,
        overriddenMethodology: d.overriddenMethodology,
      })),
    },
    createdBy: demoUser.id,
  });

  console.log("\nSeed concluído.");
  console.log("Login demo:");
  console.log("  E-mail: demo@trevosaude.com.br");
  console.log("  Senha:  Demo@2026!");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Falha ao rodar seed:", err);
    process.exit(1);
  });
