import { db } from "@/db";
import {
  projectEvents,
  projectEventFiles,
  opportunities,
  userStories,
  surveys,
  surveyResponses,
  interviews,
  fieldObservations,
  experiments,
  decisions,
} from "@/db/schema";
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { dayOf, isCategory, type CalEvent } from "./project-calendar";
import type { EventFileItem } from "./project-event-files";

const cut = (s: string | null | undefined, n: number) => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

/** Anexos dos registros manuais, agrupados por registro (só metadados; o download passa por /api/project-event-files). */
export async function loadEventFiles(projectId: string): Promise<Map<string, EventFileItem[]>> {
  const rows = await db.select().from(projectEventFiles).where(eq(projectEventFiles.projectId, projectId)).orderBy(projectEventFiles.createdAt);
  const map = new Map<string, EventFileItem[]>();
  for (const r of rows) {
    const list = map.get(r.eventId) ?? [];
    list.push({ id: r.id, name: r.fileName, size: r.sizeBytes, createdAt: r.createdAt.toISOString() });
    map.set(r.eventId, list);
  }
  return map;
}

/** Registros feitos à mão na página /calendario. */
export async function loadManualEvents(projectId: string): Promise<CalEvent[]> {
  const rows = await db.select().from(projectEvents).where(eq(projectEvents.projectId, projectId)).orderBy(desc(projectEvents.occurredOn));
  return rows.map((r) => ({
    key: `m-${r.id}`,
    source: "manual" as const,
    id: r.id,
    category: isCategory(r.category) ? r.category : "outro",
    title: r.title,
    notes: r.notes,
    counterparty: r.counterparty,
    start: r.occurredOn,
    end: r.finishedOn,
    planned: r.plannedOn,
    opportunityId: r.opportunityId,
  }));
}

/**
 * O que o app já sabe, lido direto das tabelas (nada é copiado): por isso os relatórios
 * se atualizam sozinhos a cada entrega, resposta de pesquisa, entrevista ou decisão.
 */
export async function loadAutoEvents(projectId: string): Promise<CalEvent[]> {
  const out: CalEvent[] = [];

  // Oportunidades: entregas (done_at) e prazos do Gantt (planned_start/end).
  const opps = await db.select().from(opportunities).where(eq(opportunities.projectId, projectId));
  for (const o of opps) {
    const planned = dayOf(o.plannedEndDate);
    const plannedStart = dayOf(o.plannedStartDate);
    const done = dayOf(o.doneAt);
    if (done) {
      out.push({
        key: `a-opp-done-${o.id}`,
        source: "auto",
        category: "entrega",
        title: `Oportunidade entregue: ${o.title}`,
        start: done,
        end: null,
        planned,
        href: `/opportunities/${o.id}`,
        origin: "Oportunidade",
        opportunityId: o.id,
      });
    } else if (planned && o.status !== "archived") {
      out.push({
        key: `a-opp-open-${o.id}`,
        source: "auto",
        category: "entrega",
        title: `Em andamento (prazo no Gantt): ${o.title}`,
        start: plannedStart ?? planned,
        end: null,
        planned,
        open: true,
        href: `/opportunities/${o.id}`,
        origin: "Oportunidade",
        opportunityId: o.id,
      });
    }
  }

  // User stories feitas (done_at é preenchido ao marcar como feita).
  const stories = await db
    .select({ id: userStories.id, iWant: userStories.iWant, doneAt: userStories.doneAt, oppId: opportunities.id, oppTitle: opportunities.title })
    .from(userStories)
    .innerJoin(opportunities, eq(userStories.opportunityId, opportunities.id))
    .where(and(eq(opportunities.projectId, projectId), eq(userStories.done, true), isNotNull(userStories.doneAt)));
  for (const s of stories) {
    const d = dayOf(s.doneAt);
    if (!d) continue;
    out.push({
      key: `a-story-${s.id}`,
      source: "auto",
      category: "entrega",
      title: `User story feita: ${cut(s.iWant, 90)}`,
      notes: s.oppTitle,
      start: d,
      end: null,
      planned: null,
      href: `/opportunities/${s.oppId}/doc`,
      origin: "User story",
      opportunityId: s.oppId,
    });
  }

  // Pesquisas quantitativas: criação e janela de respostas.
  const sv = await db.select().from(surveys).where(eq(surveys.projectId, projectId));
  if (sv.length) {
    const agg = await db
      .select({
        surveyId: surveyResponses.surveyId,
        n: sql<number>`count(*)::int`,
        first: sql<Date>`min(${surveyResponses.submittedAt})`,
        last: sql<Date>`max(${surveyResponses.submittedAt})`,
      })
      .from(surveyResponses)
      .where(inArray(surveyResponses.surveyId, sv.map((s) => s.id)))
      .groupBy(surveyResponses.surveyId);
    const byId = new Map(agg.map((a) => [a.surveyId, a]));
    for (const s of sv) {
      const created = dayOf(s.startDate ?? s.createdAt);
      if (created) {
        out.push({ key: `a-survey-${s.id}`, source: "auto", category: "pesquisa", title: `Pesquisa criada: ${s.title}`, start: created, end: null, planned: dayOf(s.endDate), href: `/research/surveys/${s.id}`, origin: "Pesquisa" });
      }
      const a = byId.get(s.id);
      if (a && a.n > 0) {
        const first = dayOf(a.first);
        const last = dayOf(a.last);
        if (first) {
          out.push({
            key: `a-survey-resp-${s.id}`,
            source: "auto",
            category: "pesquisa",
            title: `Respostas da pesquisa: ${s.title} (${a.n})`,
            start: first,
            end: last && last !== first ? last : null,
            planned: null,
            href: `/research/surveys/${s.id}`,
            origin: "Pesquisa",
          });
        }
      }
    }
  }

  // Entrevistas (pesquisa qualitativa).
  const iv = await db.select().from(interviews).where(eq(interviews.projectId, projectId));
  for (const i of iv) {
    const d = dayOf(i.interviewDate);
    if (!d) continue;
    const who = i.intervieweeName || i.intervieweeRef || "entrevista";
    out.push({ key: `a-int-${i.id}`, source: "auto", category: "pesquisa", title: `Entrevista: ${who}${i.intervieweeLab ? ` (${i.intervieweeLab})` : ""}`, start: d, end: null, planned: null, href: i.guideId ? `/research/interviews/${i.guideId}/interview/${i.id}` : "/research/interviews", origin: "Entrevista" });
  }

  // Observações em campo e resultados de experimentos.
  const fo = await db.select().from(fieldObservations).where(eq(fieldObservations.projectId, projectId));
  for (const f of fo) {
    const d = dayOf(f.observedAt);
    if (!d) continue;
    out.push({ key: `a-field-${f.id}`, source: "auto", category: "campo", title: `Observação em campo: ${f.title}`, notes: [f.site, f.area].filter(Boolean).join(" · ") || null, start: d, end: null, planned: null, href: `/experiments/${f.experimentId}/observations/${f.id}`, origin: "Campo" });
  }
  const ex = await db.select().from(experiments).where(and(eq(experiments.projectId, projectId), isNotNull(experiments.resultRecordedAt)));
  for (const e of ex) {
    const d = dayOf(e.resultRecordedAt);
    if (!d) continue;
    out.push({ key: `a-exp-${e.id}`, source: "auto", category: "campo", title: `Resultado de experimento: ${cut(e.objective, 90) || "sem título"}`, start: d, end: null, planned: null, href: `/experiments/${e.id}`, origin: "Experimento" });
  }

  // Decisões registradas.
  const dc = await db.select().from(decisions).where(eq(decisions.projectId, projectId));
  for (const d of dc) {
    const day = dayOf(d.decidedAt);
    if (!day) continue;
    out.push({ key: `a-dec-${d.id}`, source: "auto", category: "decisao", title: `Decisão: ${cut(d.decisionText, 100)}`, start: day, end: null, planned: null, href: `/decisions/${d.id}`, origin: "Decisão" });
  }

  return out;
}
