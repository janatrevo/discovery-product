// Antes desta verificação existir, excluir uma Hipótese/Persona/Produto que
// já tivesse qualquer coisa real vinculada (experimento, survey, entrevista,
// oportunidade, simulação...) quebrava com um erro cru de violação de chave
// estrangeira do Postgres — sem explicação nenhuma pra quem clicou em
// "Excluir". Pior: como Decisão referencia hipótese/evidência via um array
// jsonb solto (sem FK), excluir uma hipótese citada numa decisão já
// registrada passava batido silenciosamente, deixando o Decision Log — que
// deveria ser um registro imutável e sempre rastreável — com referências
// quebradas sem nenhum aviso.
//
// Estas funções verificam ANTES de tentar excluir, e devolvem uma lista de
// razões legíveis para bloquear a exclusão — nunca deixam o banco decidir
// isso sozinho com um erro genérico.
import { db } from "@/db";
import { sql, eq } from "drizzle-orm";
import {
  experiments,
  opportunities,
  surveys,
  interviewGuides,
  usabilityTests,
  usabilityFindings,
  simulationRuns,
  simulationResponses,
  evidence,
  interviews,
  decisions,
} from "@/db/schema";

export async function checkHypothesisDeletable(hypothesisId: string): Promise<string[]> {
  const reasons: string[] = [];

  const [
    [{ count: experimentCount }],
    [{ count: opportunityCount }],
    [{ count: surveyCount }],
    [{ count: guideCount }],
    [{ count: usabilityTestCount }],
    [{ count: usabilityFindingCount }],
    [{ count: simulationCount }],
    decisionsReferencing,
  ] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(experiments).where(eq(experiments.hypothesisId, hypothesisId)),
    db.select({ count: sql<number>`count(*)::int` }).from(opportunities).where(eq(opportunities.hypothesisId, hypothesisId)),
    db.select({ count: sql<number>`count(*)::int` }).from(surveys).where(eq(surveys.hypothesisId, hypothesisId)),
    db.select({ count: sql<number>`count(*)::int` }).from(interviewGuides).where(eq(interviewGuides.hypothesisId, hypothesisId)),
    db.select({ count: sql<number>`count(*)::int` }).from(usabilityTests).where(eq(usabilityTests.hypothesisId, hypothesisId)),
    db.select({ count: sql<number>`count(*)::int` }).from(usabilityFindings).where(eq(usabilityFindings.hypothesisId, hypothesisId)),
    db.select({ count: sql<number>`count(*)::int` }).from(simulationRuns).where(eq(simulationRuns.hypothesisId, hypothesisId)),
    db.select({ id: decisions.id }).from(decisions).where(sql`${decisions.hypothesisRefs} @> ${JSON.stringify([hypothesisId])}::jsonb`),
  ]);

  if (experimentCount > 0) reasons.push(`${experimentCount} experimento(s) vinculado(s)`);
  if (opportunityCount > 0) reasons.push(`${opportunityCount} oportunidade(s) do Discovery Board vinculada(s)`);
  if (surveyCount > 0) reasons.push(`${surveyCount} survey(s) vinculado(s)`);
  if (guideCount > 0) reasons.push(`${guideCount} roteiro(s) de entrevista vinculado(s)`);
  if (usabilityTestCount > 0) reasons.push(`${usabilityTestCount} teste(s) de usabilidade vinculado(s)`);
  if (usabilityFindingCount > 0) reasons.push(`${usabilityFindingCount} achado(s) de usabilidade vinculado(s)`);
  if (simulationCount > 0) reasons.push(`${simulationCount} simulação(ões) de persona vinculada(s)`);
  if (decisionsReferencing.length > 0) {
    reasons.push(
      `${decisionsReferencing.length} decisão(ões) já registrada(s) cita(m) esta hipótese — para preservar o histórico, hipóteses citadas em decisões nunca podem ser excluídas`
    );
  }

  return reasons;
}

export async function checkPersonaDeletable(personaId: string): Promise<string[]> {
  const reasons: string[] = [];

  const [
    [{ count: experimentCount }],
    [{ count: evidenceCount }],
    [{ count: interviewCount }],
    [{ count: findingCount }],
    [{ count: opportunityCount }],
    [{ count: responseCount }],
  ] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(experiments).where(eq(experiments.personaId, personaId)),
    db.select({ count: sql<number>`count(*)::int` }).from(evidence).where(eq(evidence.personaId, personaId)),
    db.select({ count: sql<number>`count(*)::int` }).from(interviews).where(eq(interviews.personaId, personaId)),
    db.select({ count: sql<number>`count(*)::int` }).from(usabilityFindings).where(eq(usabilityFindings.personaId, personaId)),
    db.select({ count: sql<number>`count(*)::int` }).from(opportunities).where(eq(opportunities.personaId, personaId)),
    db.select({ count: sql<number>`count(*)::int` }).from(simulationResponses).where(eq(simulationResponses.personaId, personaId)),
  ]);

  if (experimentCount > 0) reasons.push(`${experimentCount} experimento(s) vinculado(s)`);
  if (evidenceCount > 0) reasons.push(`${evidenceCount} evidência(s) vinculada(s)`);
  if (interviewCount > 0) reasons.push(`${interviewCount} entrevista(s) vinculada(s)`);
  if (findingCount > 0) reasons.push(`${findingCount} achado(s) de usabilidade vinculado(s)`);
  if (opportunityCount > 0) reasons.push(`${opportunityCount} oportunidade(s) vinculada(s)`);
  if (responseCount > 0) reasons.push(`${responseCount} resposta(s) de simulação vinculada(s)`);

  return reasons;
}

export async function checkProductDeletable(productId: string): Promise<string[]> {
  const reasons: string[] = [];
  const [{ count: simulationCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(simulationRuns)
    .where(eq(simulationRuns.productId, productId));
  if (simulationCount > 0) reasons.push(`${simulationCount} simulação(ões) vinculada(s)`);
  return reasons;
}

export function deleteBlockedMessage(entityLabel: string, reasons: string[]) {
  return `Não é possível excluir ${entityLabel} porque há: ${reasons.join("; ")}. Desvincule ou exclua essas referências primeiro.`;
}
