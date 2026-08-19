// Schema Drizzle ORM — espelha o modelo de dados da seção 18 da especificação
// (Plataforma de Product Discovery & Validação de Hipóteses).
//
// Convenções:
// - Todas as tabelas de negócio têm id uuid, created_at, created_by (quando aplicável).
// - origin_class / generated_by aparecem em toda tabela cujo conteúdo pode ter
//   sido produzido por IA — ver README.md > "Governança de proveniência".
// - Este schema é escrito para rodar via conexão Postgres direta (funciona tanto
//   contra o Postgres local de dev quanto contra a connection string do Supabase).
//   Ver MIGRATING_TO_SUPABASE.md para RLS policies equivalentes.

import {
  pgTable,
  uuid,
  text,
  varchar,
  timestamp,
  boolean,
  integer,
  numeric,
  jsonb,
  pgEnum,
  primaryKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();

// ---------- Enums ----------
export const projectRoleEnum = pgEnum("project_role", [
  "owner",
  "editor",
  "contributor",
  "viewer",
]);

export const personaOriginEnum = pgEnum("persona_origin", ["research_based", "synthetic"]);

export const hypothesisTypeEnum = pgEnum("hypothesis_type", [
  "problem",
  "user_behavioral",
  "solution",
  "value",
  "usability",
  "business_outcome",
  "pricing",
  "acquisition_channel",
  "retention_engagement",
  "ecosystem_partnership",
]);

export const hypothesisStatusEnum = pgEnum("hypothesis_status", [
  "not_tested",
  "investigating",
  "partially_validated",
  "validated",
  "invalidated",
  "inconclusive",
]);

// A distinção mais importante do produto inteiro — ver seção 13 do documento.
export const originClassEnum = pgEnum("origin_class", ["real_data", "inference", "simulation"]);
export const generatedByEnum = pgEnum("generated_by", ["human", "ai_assisted", "ai_generated"]);

export const experimentMethodEnum = pgEnum("experiment_method", [
  "interview",
  "survey",
  "usability_test",
  "concept_test",
  "landing_page",
  "fake_door",
  "ab_test",
  "prototype_test",
  "price_test",
]);

export const experimentStatusEnum = pgEnum("experiment_status", [
  "planned",
  "in_progress",
  "completed",
]);

export const questionTypeEnum = pgEnum("question_type", [
  "likert",
  "single_choice",
  "multi_choice",
  "ranking",
  "matrix",
  "nps",
  "purchase_intent",
  "frequency",
  "demographic",
  "open_text",
]);

export const surveyStatusEnum = pgEnum("survey_status", ["draft", "published", "closed"]);

export const severityEnum = pgEnum("severity", ["low", "medium", "high", "critical"]);

export const simulationModeEnum = pgEnum("simulation_mode", ["scenario", "image"]);

export const opportunityStatusEnum = pgEnum("opportunity_status", [
  "new",
  "prioritized",
  "in_progress",
  "done",
  "archived",
]);

// Decisão pós-teste A/B de uma oportunidade já transformada em Feature no
// Azure DevOps: "testing" enquanto o experimento roda, depois "keep" (aplicar
// permanentemente) ou "remove" (reverter). Também é espelhada como tag no
// card do Azure DevOps (ver src/lib/azure-devops.ts) para aparecer direto no
// board, não só dentro do discovery-app.
export const abTestDecisionEnum = pgEnum("ab_test_decision", ["testing", "keep", "remove"]);

// ---------- Identidade / colaboração ----------
export const users = pgTable("users", {
  id: id(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  createdAt: createdAt(),
});

export const organizations = pgTable("organizations", {
  id: id(),
  name: varchar("name", { length: 255 }).notNull(),
  createdAt: createdAt(),
});

export const projects = pgTable("projects", {
  id: id(),
  organizationId: uuid("organization_id").references(() => organizations.id, {
    onDelete: "cascade",
  }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  // Limiares configuráveis por workspace (seção 9 do doc) — os mínimos estruturais
  // (2 fontes independentes, override rastreado) NÃO são configuráveis; só os
  // limiares numéricos abaixo.
  confidenceValidatedThreshold: integer("confidence_validated_threshold").default(70).notNull(),
  minSampleSurvey: integer("min_sample_survey").default(30).notNull(),
  minSampleInterview: integer("min_sample_interview").default(5).notNull(),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: createdAt(),
});

export const projectMemberships = pgTable(
  "project_memberships",
  {
    projectId: uuid("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    role: projectRoleEnum("role").notNull().default("contributor"),
    invitedBy: uuid("invited_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.userId] })]
);

// ---------- Personas ----------
export const personas = pgTable("personas", {
  id: id(),
  projectId: uuid("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  // Vínculo direto persona -> produto (1 produto por persona, opcional) —
  // diferente do vínculo hipótese <-> produto (hypothesis_products, N:N).
  // Usado pra responder "quem é o público desse produto específico?" sem
  // precisar passar por uma hipótese. Sem onDelete: excluir um produto com
  // personas vinculadas é bloqueado por checkProductDeletable (ver
  // src/lib/delete-guards.ts) até desvincular.
  productId: uuid("product_id").references(() => products.id),
  name: varchar("name", { length: 255 }).notNull(),
  origin: personaOriginEnum("origin").notNull(),
  shortDescription: text("short_description"),
  jtbdMain: text("jtbd_main"),
  // Bloco de contexto
  professionalContext: text("professional_context"),
  personalContext: text("personal_context"),
  usageContext: text("usage_context"),
  purchaseContext: text("purchase_context"),
  techFamiliarity: text("tech_familiarity"),
  problemKnowledge: text("problem_knowledge"),
  solutionKnowledge: text("solution_knowledge"),
  // Bloco comportamental (arrays em jsonb para simplicidade de UI de tags)
  goals: jsonb("goals").$type<string[]>().default(sql`'[]'::jsonb`),
  pains: jsonb("pains").$type<string[]>().default(sql`'[]'::jsonb`),
  frustrations: jsonb("frustrations").$type<string[]>().default(sql`'[]'::jsonb`),
  needs: jsonb("needs").$type<string[]>().default(sql`'[]'::jsonb`),
  motivations: jsonb("motivations").$type<string[]>().default(sql`'[]'::jsonb`),
  behaviors: jsonb("behaviors").$type<string[]>().default(sql`'[]'::jsonb`),
  fears: jsonb("fears").$type<string[]>().default(sql`'[]'::jsonb`),
  objections: jsonb("objections").$type<string[]>().default(sql`'[]'::jsonb`),
  decisionCriteria: jsonb("decision_criteria").$type<string[]>().default(sql`'[]'::jsonb`),
  priceSensitivity: text("price_sensitivity"),
  // Evidência de apoio
  realQuotes: jsonb("real_quotes").$type<string[]>().default(sql`'[]'::jsonb`),
  currentAlternatives: jsonb("current_alternatives").$type<string[]>().default(sql`'[]'::jsonb`),
  competitorProducts: jsonb("competitor_products").$type<string[]>().default(sql`'[]'::jsonb`),
  characteristicLanguage: text("characteristic_language"),
  sources: jsonb("sources").$type<string[]>().default(sql`'[]'::jsonb`),
  completeness: integer("completeness").default(0).notNull(), // % preenchido, calculado no app
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const personaVersions = pgTable("persona_versions", {
  id: id(),
  personaId: uuid("persona_id")
    .references(() => personas.id, { onDelete: "cascade" })
    .notNull(),
  versionNo: integer("version_no").notNull(),
  snapshot: jsonb("snapshot").notNull(),
  changeNote: text("change_note"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: createdAt(),
});

// ---------- Produtos / Conceitos ----------
export const products = pgTable("products", {
  id: id(),
  projectId: uuid("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 120 }),
  problemSolved: text("problem_solved"),
  targetAudience: text("target_audience"),
  valueProposition: text("value_proposition"),
  features: jsonb("features").$type<string[]>().default(sql`'[]'::jsonb`),
  benefits: jsonb("benefits").$type<string[]>().default(sql`'[]'::jsonb`),
  differentiators: jsonb("differentiators").$type<string[]>().default(sql`'[]'::jsonb`),
  limitations: jsonb("limitations").$type<string[]>().default(sql`'[]'::jsonb`),
  price: varchar("price", { length: 120 }),
  businessModel: varchar("business_model", { length: 255 }),
  competitors: jsonb("competitors").$type<string[]>().default(sql`'[]'::jsonb`),
  version: varchar("version", { length: 60 }).default("v1"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: createdAt(),
});

export const productAssets = pgTable("product_assets", {
  id: id(),
  productId: uuid("product_id")
    .references(() => products.id, { onDelete: "cascade" })
    .notNull(),
  assetType: varchar("asset_type", { length: 60 }).notNull(), // image|wireframe|prototype|landing_page|doc
  url: text("url").notNull(),
  filename: text("filename"),
  createdAt: createdAt(),
});

// ---------- Hipóteses ----------
export const hypotheses = pgTable("hypotheses", {
  id: id(),
  projectId: uuid("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  title: text("title").notNull(),
  description: text("description"),
  type: hypothesisTypeEnum("type").notNull(),
  status: hypothesisStatusEnum("status").notNull().default("not_tested"),
  problemRef: text("problem_ref"),
  solutionRef: text("solution_ref"),
  context: text("context"),
  validationMethod: text("validation_method"),
  // Calculado deterministicamente — nunca editado à mão (ver src/lib/confidence.ts)
  confidenceScore: numeric("confidence_score", { precision: 5, scale: 1 }).default("0"),
  confidenceReceipt: jsonb("confidence_receipt"),
  statusOverridden: boolean("status_overridden").default(false).notNull(),
  statusOverrideReason: text("status_override_reason"),
  ownerId: uuid("owner_id").references(() => users.id),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const hypothesisPersonas = pgTable(
  "hypothesis_personas",
  {
    hypothesisId: uuid("hypothesis_id")
      .references(() => hypotheses.id, { onDelete: "cascade" })
      .notNull(),
    personaId: uuid("persona_id")
      .references(() => personas.id, { onDelete: "cascade" })
      .notNull(),
  },
  (t) => [primaryKey({ columns: [t.hypothesisId, t.personaId] })]
);

export const hypothesisProducts = pgTable(
  "hypothesis_products",
  {
    hypothesisId: uuid("hypothesis_id")
      .references(() => hypotheses.id, { onDelete: "cascade" })
      .notNull(),
    productId: uuid("product_id")
      .references(() => products.id, { onDelete: "cascade" })
      .notNull(),
  },
  (t) => [primaryKey({ columns: [t.hypothesisId, t.productId] })]
);

// Append-only — nunca UPDATE, só INSERT (ver seção 25 do documento).
export const hypothesisHistory = pgTable("hypothesis_history", {
  id: id(),
  hypothesisId: uuid("hypothesis_id")
    .references(() => hypotheses.id, { onDelete: "cascade" })
    .notNull(),
  fieldChanged: varchar("field_changed", { length: 120 }).notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  note: text("note"),
  isOverride: boolean("is_override").default(false).notNull(),
  changedBy: uuid("changed_by").references(() => users.id),
  changedAt: createdAt(),
});

// ---------- Evidência ----------
export const evidence = pgTable("evidence", {
  id: id(),
  projectId: uuid("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  source: text("source").notNull(),
  type: varchar("type", { length: 80 }).notNull(), // interview|survey|usability_test|behavioral|experiment|manual
  evidenceDate: timestamp("evidence_date", { withTimezone: true }).defaultNow().notNull(),
  personaId: uuid("persona_id").references(() => personas.id),
  context: text("context"),
  content: text("content").notNull(),
  qualityScore: integer("quality_score"), // 0-100, calculado (ver src/lib/confidence.ts)
  reliabilityScore: integer("reliability_score"), // 0-100
  sampleSize: integer("sample_size"),
  // Proveniência — nunca editável para real_data se a origem foi um módulo de IA.
  originClass: originClassEnum("origin_class").notNull(),
  originMethod: varchar("origin_method", { length: 120 }).notNull(),
  generatedBy: generatedByEnum("generated_by").notNull().default("human"),
  // Rastreiam de qual survey/entrevista esta evidência foi "promovida" (ver
  // promoteSurveyToEvidence / promoteInterviewToEvidence) — sem FK formal de
  // propósito (evita ciclo de declaração com surveys/interviews, que vêm
  // depois neste arquivo); usadas só para idempotência e link de proveniência.
  sourceSurveyId: uuid("source_survey_id"),
  sourceInterviewId: uuid("source_interview_id"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: createdAt(),
});

export const hypothesisEvidence = pgTable(
  "hypothesis_evidence",
  {
    hypothesisId: uuid("hypothesis_id")
      .references(() => hypotheses.id, { onDelete: "cascade" })
      .notNull(),
    evidenceId: uuid("evidence_id")
      .references(() => evidence.id, { onDelete: "cascade" })
      .notNull(),
    favorable: boolean("favorable").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.hypothesisId, t.evidenceId] })]
);

// ---------- Experimentos ----------
export const experiments = pgTable("experiments", {
  id: id(),
  projectId: uuid("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  hypothesisId: uuid("hypothesis_id")
    .references(() => hypotheses.id, { onDelete: "cascade" })
    .notNull(),
  objective: text("objective"),
  personaId: uuid("persona_id").references(() => personas.id),
  variable: text("variable"),
  method: experimentMethodEnum("method").notNull(),
  metric: text("metric"),
  successCriteria: text("success_criteria"),
  successCriteriaLockedAt: timestamp("success_criteria_locked_at", { withTimezone: true }),
  samplePlanned: integer("sample_planned"),
  sampleActual: integer("sample_actual"),
  resultExpected: text("result_expected"),
  resultObserved: text("result_observed"),
  conclusion: text("conclusion"),
  nextStep: text("next_step"),
  status: experimentStatusEnum("status").notNull().default("planned"),
  resultRecordedAt: timestamp("result_recorded_at", { withTimezone: true }),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: createdAt(),
});

// ---------- Pesquisa quantitativa ----------
export const surveys = pgTable("surveys", {
  id: id(),
  projectId: uuid("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  hypothesisId: uuid("hypothesis_id").references(() => hypotheses.id),
  title: varchar("title", { length: 255 }).notNull(),
  objective: text("objective"),
  targetAudience: text("target_audience"),
  sampleTarget: integer("sample_target").default(30),
  status: surveyStatusEnum("status").notNull().default("draft"),
  publicSlug: varchar("public_slug", { length: 60 }).unique(),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: createdAt(),
});

export const surveyQuestions = pgTable("survey_questions", {
  id: id(),
  surveyId: uuid("survey_id")
    .references(() => surveys.id, { onDelete: "cascade" })
    .notNull(),
  orderIndex: integer("order_index").notNull().default(0),
  questionText: text("question_text").notNull(),
  questionType: questionTypeEnum("question_type").notNull(),
  options: jsonb("options").$type<string[]>().default(sql`'[]'::jsonb`),
  leadingFlag: boolean("leading_flag").default(false).notNull(),
  leadingFlagNote: text("leading_flag_note"),
});

export const surveyResponses = pgTable("survey_responses", {
  id: id(),
  surveyId: uuid("survey_id")
    .references(() => surveys.id, { onDelete: "cascade" })
    .notNull(),
  respondentRef: varchar("respondent_ref", { length: 120 }),
  segment: jsonb("segment"),
  submittedAt: createdAt(),
});

export const surveyAnswers = pgTable("survey_answers", {
  id: id(),
  responseId: uuid("response_id")
    .references(() => surveyResponses.id, { onDelete: "cascade" })
    .notNull(),
  questionId: uuid("question_id")
    .references(() => surveyQuestions.id, { onDelete: "cascade" })
    .notNull(),
  answerValue: jsonb("answer_value").notNull(),
});

// ---------- Pesquisa qualitativa ----------
export const interviewGuides = pgTable("interview_guides", {
  id: id(),
  projectId: uuid("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  hypothesisId: uuid("hypothesis_id").references(() => hypotheses.id),
  title: varchar("title", { length: 255 }).notNull(),
  objective: text("objective"),
  scenario: text("scenario"),
  jtbdContext: text("jtbd_context"),
  jtbdMotivation: text("jtbd_motivation"),
  jtbdObstacle: text("jtbd_obstacle"),
  jtbdExpectedOutcome: text("jtbd_expected_outcome"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: createdAt(),
});

export const interviewGuideQuestions = pgTable("interview_guide_questions", {
  id: id(),
  guideId: uuid("guide_id")
    .references(() => interviewGuides.id, { onDelete: "cascade" })
    .notNull(),
  orderIndex: integer("order_index").notNull().default(0),
  questionText: text("question_text").notNull(),
  isFollowup: boolean("is_followup").default(false).notNull(),
});

export const interviews = pgTable("interviews", {
  id: id(),
  projectId: uuid("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  guideId: uuid("guide_id").references(() => interviewGuides.id),
  personaId: uuid("persona_id").references(() => personas.id),
  intervieweeRef: varchar("interviewee_ref", { length: 255 }),
  interviewDate: timestamp("interview_date", { withTimezone: true }).defaultNow().notNull(),
  transcript: text("transcript"),
  recordingUrl: text("recording_url"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: createdAt(),
});

export const codes = pgTable("codes", {
  id: id(),
  projectId: uuid("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  description: text("description"),
  color: varchar("color", { length: 20 }).default("#6366f1"),
  createdAt: createdAt(),
});

export const codedSegments = pgTable("coded_segments", {
  id: id(),
  interviewId: uuid("interview_id")
    .references(() => interviews.id, { onDelete: "cascade" })
    .notNull(),
  codeId: uuid("code_id")
    .references(() => codes.id, { onDelete: "cascade" })
    .notNull(),
  excerpt: text("excerpt").notNull(),
  aiSuggested: boolean("ai_suggested").default(false).notNull(),
  confirmed: boolean("confirmed").default(false).notNull(),
  isRepresentativeQuote: boolean("is_representative_quote").default(false).notNull(),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: createdAt(),
});

// ---------- Testes de usabilidade / imagem ----------
export const usabilityTests = pgTable("usability_tests", {
  id: id(),
  projectId: uuid("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  hypothesisId: uuid("hypothesis_id").references(() => hypotheses.id),
  title: varchar("title", { length: 255 }).notNull(),
  scenario: text("scenario"),
  task: text("task"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: createdAt(),
});

export const usabilityTestAssets = pgTable("usability_test_assets", {
  id: id(),
  usabilityTestId: uuid("usability_test_id")
    .references(() => usabilityTests.id, { onDelete: "cascade" })
    .notNull(),
  assetType: varchar("asset_type", { length: 60 }).notNull(),
  url: text("url").notNull(),
  filename: text("filename"),
  createdAt: createdAt(),
});

export const usabilityTestPersonas = pgTable(
  "usability_test_personas",
  {
    usabilityTestId: uuid("usability_test_id")
      .references(() => usabilityTests.id, { onDelete: "cascade" })
      .notNull(),
    personaId: uuid("persona_id")
      .references(() => personas.id, { onDelete: "cascade" })
      .notNull(),
  },
  (t) => [primaryKey({ columns: [t.usabilityTestId, t.personaId] })]
);

export const usabilityFindings = pgTable("usability_findings", {
  id: id(),
  usabilityTestId: uuid("usability_test_id")
    .references(() => usabilityTests.id, { onDelete: "cascade" })
    .notNull(),
  screenRef: varchar("screen_ref", { length: 255 }),
  problem: text("problem").notNull(),
  personaId: uuid("persona_id").references(() => personas.id),
  severity: severityEnum("severity").notNull().default("medium"),
  evidenceRef: text("evidence_ref"),
  hypothesisId: uuid("hypothesis_id").references(() => hypotheses.id),
  recommendation: text("recommendation"),
  humanConfirmed: boolean("human_confirmed").default(false).notNull(),
  originClass: originClassEnum("origin_class").notNull().default("simulation"),
  generatedBy: generatedByEnum("generated_by").notNull().default("ai_generated"),
  createdAt: createdAt(),
});

// ---------- Simulação de IA (Persona Simulation Engine) ----------
export const simulationRuns = pgTable("simulation_runs", {
  id: id(),
  projectId: uuid("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  hypothesisId: uuid("hypothesis_id").references(() => hypotheses.id), // relação inspired_research, nunca evidence_for
  mode: simulationModeEnum("mode").notNull().default("scenario"),
  personaIds: jsonb("persona_ids").$type<string[]>().notNull(),
  productId: uuid("product_id").references(() => products.id),
  scenario: text("scenario"),
  task: text("task"),
  promptSnapshot: text("prompt_snapshot"),
  modelVersion: varchar("model_version", { length: 120 }),
  isMock: boolean("is_mock").default(false).notNull(),
  // Comparação entre personas quando a rodada tem mais de uma (painel
  // multi-persona) — ver synthesizePersonaPanel em src/lib/ai.ts.
  // {consensus: string[], divergence: string[], segmentation_signal: string}
  synthesisJson: jsonb("synthesis_json"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: createdAt(),
});

export const simulationResponses = pgTable("simulation_responses", {
  id: id(),
  simulationRunId: uuid("simulation_run_id")
    .references(() => simulationRuns.id, { onDelete: "cascade" })
    .notNull(),
  personaId: uuid("persona_id")
    .references(() => personas.id)
    .notNull(),
  responseJson: jsonb("response_json"),
  rawText: text("raw_text"),
});

// ---------- Insights / Oportunidades / Decisões ----------
export const insights = pgTable("insights", {
  id: id(),
  projectId: uuid("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  title: text("title").notNull(),
  description: text("description"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: createdAt(),
});

export const insightEvidence = pgTable(
  "insight_evidence",
  {
    insightId: uuid("insight_id")
      .references(() => insights.id, { onDelete: "cascade" })
      .notNull(),
    evidenceId: uuid("evidence_id")
      .references(() => evidence.id, { onDelete: "cascade" })
      .notNull(),
  },
  (t) => [primaryKey({ columns: [t.insightId, t.evidenceId] })]
);

export const insightHypotheses = pgTable(
  "insight_hypotheses",
  {
    insightId: uuid("insight_id")
      .references(() => insights.id, { onDelete: "cascade" })
      .notNull(),
    hypothesisId: uuid("hypothesis_id")
      .references(() => hypotheses.id, { onDelete: "cascade" })
      .notNull(),
  },
  (t) => [primaryKey({ columns: [t.insightId, t.hypothesisId] })]
);

export const opportunities = pgTable("opportunities", {
  id: id(),
  projectId: uuid("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  insightId: uuid("insight_id").references(() => insights.id),
  hypothesisId: uuid("hypothesis_id").references(() => hypotheses.id),
  personaId: uuid("persona_id").references(() => personas.id),
  title: varchar("title", { length: 255 }).notNull(),
  problemRef: text("problem_ref"),
  description: text("description"),
  impact: integer("impact").default(3).notNull(), // 1-5
  frequency: integer("frequency").default(3).notNull(), // 1-5
  severity: integer("severity").default(3).notNull(), // 1-5
  businessPotential: integer("business_potential").default(3).notNull(), // 1-5
  solutionEase: integer("solution_ease").default(3).notNull(), // 1-5 (5 = fácil)
  evidenceConfidence: integer("evidence_confidence").default(0).notNull(), // herdado do confidence score
  priorityScore: numeric("priority_score", { precision: 6, scale: 2 }),
  status: opportunityStatusEnum("status").notNull().default("new"),
  // Ciclo de resultado pós-lançamento: doneAt marca quando a oportunidade
  // virou "done" (setado/limpo automaticamente em updateOpportunityStatus);
  // outcomeCheckedAt/outcomeSummary registram o que de fato aconteceu depois
  // — opcionalmente com uma Evidência real vinculada (outcomeEvidenceId),
  // fechando o ciclo discovery → entrega → aprendizado.
  doneAt: timestamp("done_at", { withTimezone: true }),
  outcomeCheckedAt: timestamp("outcome_checked_at", { withTimezone: true }),
  outcomeSummary: text("outcome_summary"),
  outcomeEvidenceId: uuid("outcome_evidence_id").references(() => evidence.id),
  // Integração com Azure DevOps (ver src/lib/azure-devops.ts): quando a
  // oportunidade é enviada como Feature para o board Trevo Labs, guarda o id
  // do work item (número, id nativo do Azure DevOps — não é o mesmo id uuid
  // desta tabela). planned{Start,End}Date alimentam o Gráfico Gantt de
  // roadmap (ver /azure-devops/roadmap) — são datas de planejamento do
  // discovery-app, não campos nativos do Azure DevOps (evita depender de
  // Start Date/Target Date existirem no processo configurado lá).
  azureFeatureId: integer("azure_feature_id"),
  plannedStartDate: timestamp("planned_start_date", { withTimezone: true }),
  plannedEndDate: timestamp("planned_end_date", { withTimezone: true }),
  abTestDecision: abTestDecisionEnum("ab_test_decision").notNull().default("testing"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: createdAt(),
});

// ---------- PRD & User Stories (por Oportunidade) ----------
// Documento estruturado que liga o que já foi validado no discovery (hipótese
// + evidência + persona da Oportunidade) ao que a engenharia vai construir.
// O rascunho pode ser gerado por IA a partir desses vínculos (generatedBy
// começa "ai_generated"), mas assim que um humano edita o conteúdo passa a
// "ai_assisted" — nunca fica marcado como puramente humano sem ter sido de
// fato revisado por alguém (reviewedBy/reviewedAt).
export const productDocs = pgTable("product_docs", {
  id: id(),
  opportunityId: uuid("opportunity_id")
    .references(() => opportunities.id, { onDelete: "cascade" })
    .notNull()
    .unique(),
  goals: jsonb("goals").$type<string[]>().default(sql`'[]'::jsonb`),
  nonGoals: jsonb("non_goals").$type<string[]>().default(sql`'[]'::jsonb`),
  openQuestions: jsonb("open_questions").$type<string[]>().default(sql`'[]'::jsonb`),
  // Usados ao transformar a oportunidade em Feature no Azure DevOps (ver
  // sendToAzureDevOps em opportunities/[id]/doc/actions.ts) — junto com
  // goals/nonGoals/openQuestions e os Acceptance Criteria já existentes em
  // cada User Story, compõem o card completo.
  businessRules: jsonb("business_rules").$type<string[]>().default(sql`'[]'::jsonb`),
  successMetrics: jsonb("success_metrics").$type<string[]>().default(sql`'[]'::jsonb`),
  generatedBy: generatedByEnum("generated_by").notNull().default("human"),
  promptSnapshot: text("prompt_snapshot"),
  modelVersion: varchar("model_version", { length: 120 }),
  reviewedBy: uuid("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const userStories = pgTable("user_stories", {
  id: id(),
  opportunityId: uuid("opportunity_id")
    .references(() => opportunities.id, { onDelete: "cascade" })
    .notNull(),
  asA: varchar("as_a", { length: 255 }),
  iWant: text("i_want").notNull(),
  soThat: text("so_that"),
  acceptanceCriteria: jsonb("acceptance_criteria").$type<string[]>().default(sql`'[]'::jsonb`),
  priority: varchar("priority", { length: 20 }).notNull().default("should"), // must|should|could (MoSCoW)
  // Mesma convenção já usada em coded_segments (ai_suggested/confirmed) —
  // uma story sugerida por IA some/perde peso até alguém confirmar.
  aiGenerated: boolean("ai_generated").notNull().default(false),
  confirmed: boolean("confirmed").notNull().default(true),
  done: boolean("done").notNull().default(false),
  orderIndex: integer("order_index").notNull().default(0),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: createdAt(),
});

export const decisions = pgTable("decisions", {
  id: id(),
  projectId: uuid("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  decisionText: text("decision_text").notNull(),
  rationale: text("rationale"),
  evidenceRefs: jsonb("evidence_refs").$type<string[]>().default(sql`'[]'::jsonb`),
  hypothesisRefs: jsonb("hypothesis_refs").$type<string[]>().default(sql`'[]'::jsonb`),
  opportunityId: uuid("opportunity_id").references(() => opportunities.id),
  decidedBy: uuid("decided_by").references(() => users.id),
  decidedAt: timestamp("decided_at", { withTimezone: true }).defaultNow().notNull(),
  overriddenMethodology: boolean("overridden_methodology").default(false).notNull(),
  createdAt: createdAt(),
});

// ---------- Colaboração ----------
export const comments = pgTable("comments", {
  id: id(),
  projectId: uuid("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  entityType: varchar("entity_type", { length: 60 }).notNull(),
  entityId: uuid("entity_id").notNull(),
  authorId: uuid("author_id").references(() => users.id),
  body: text("body").notNull(),
  parentCommentId: uuid("parent_comment_id"),
  createdAt: createdAt(),
});

export const mentions = pgTable("mentions", {
  id: id(),
  commentId: uuid("comment_id")
    .references(() => comments.id, { onDelete: "cascade" })
    .notNull(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
});

// Histórico de rodadas de detecção de padrões cruzando hipóteses (Research
// Repository) — a IA lê evidências real_data de hipóteses diferentes e
// aponta temas recorrentes. É sempre uma leitura interpretativa
// (originClass = inference na exibição), nunca uma evidência nova por si só.
export const patternAnalyses = pgTable("pattern_analyses", {
  id: id(),
  projectId: uuid("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  patternsJson: jsonb("patterns_json").notNull(),
  evidenceCountAnalyzed: integer("evidence_count_analyzed").notNull().default(0),
  isMock: boolean("is_mock").notNull().default(false),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: createdAt(),
});

export const reports = pgTable("reports", {
  id: id(),
  projectId: uuid("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  scope: jsonb("scope"),
  content: jsonb("content"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: createdAt(),
});
