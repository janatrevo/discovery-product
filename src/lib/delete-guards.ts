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
  usabilityFindings,
  simulationResponses,
  evidence,
  interviews,
  decisions,
} from "@/db/schema";

// Hipótese: quase tudo que está ligado a ela é apagado junto (experimentos,
// oportunidades, testes de usabilidade, simulações) ou só desvinculado
// (surveys, roteiros, achados, personas, evidências) quando ela é excluída —
// ver deleteHypothesis em src/app/(app)/hypotheses/actions.ts. A ÚNICA coisa
// que bloqueia é o Decision Log: decisão registrada é histórico e nunca fica
// com referência quebrada.
export async function checkHypothesisDeletable(hypothesisId: string): Promise<string[]> {
  const reasons: string[] = [];

  const [decisionsReferencing, decisionsViaOpportunity] = await Promise.all([
    db.select({ id: decisions.id }).from(decisions).where(sql`${decisions.hypothesisRefs} @> ${JSON.stringify([hypothesisId])}::jsonb`),
    db
      .select({ id: decisions.id })
      .from(decisions)
      .innerJoin(opportunities, eq(opportunities.id, decisions.opportunityId))
      .where(eq(opportunities.hypothesisId, hypothesisId)),
  ]);

  if (decisionsReferencing.length > 0) {
    reasons.push(
      `${decisionsReferencing.length} decisão(ões) já registrada(s) cita(m) esta hipótese — para preservar o histórico, hipóteses citadas em decisões nunca podem ser excluídas`
    );
  }
  if (decisionsViaOpportunity.length > 0) {
    reasons.push(
      `${decisionsViaOpportunity.length} decisão(ões) já registrada(s) está(ão) ligada(s) a oportunidades desta hipótese — para preservar o histórico, essas oportunidades não podem ser apagadas`
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

// Produto: não bloqueia mais nada — simulações do produto são apagadas e
// personas só são desvinculadas (ver deleteProduct em products/actions.ts).
export async function checkProductDeletable(_productId: string): Promise<string[]> {
  return [];
}

export function deleteBlockedMessage(entityLabel: string, reasons: string[]) {
  return `Não é possível excluir ${entityLabel} porque há: ${reasons.join("; ")}. Desvincule ou exclua essas referências primeiro.`;
}
