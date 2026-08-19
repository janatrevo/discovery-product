import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/db";
import { opportunities, personas, hypotheses } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getPageContext } from "@/lib/page-context";
import { featureWebUrl } from "@/lib/azure-devops";
import { Badge, Button, Card, Field, Input, Label, PageHeader, Select, Textarea } from "@/components/ui/primitives";
import {
  updateOpportunityScores,
  updateOpportunityStatus,
  recordOpportunityOutcome,
  updatePlannedDates,
  setAbTestDecision,
} from "../actions";

const AB_DECISION_LABELS: Record<string, string> = {
  testing: "Em teste A/B",
  keep: "Manter permanentemente",
  remove: "Remover após o teste",
};

const AB_DECISION_COLORS: Record<string, "amber" | "emerald" | "red"> = {
  testing: "amber",
  keep: "emerald",
  remove: "red",
};

function toDateInputValue(d: Date | string | null | undefined) {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toISOString().slice(0, 10);
}

const STATUS_OPTIONS = [
  { value: "new", label: "Nova" },
  { value: "prioritized", label: "Priorizada" },
  { value: "in_progress", label: "Em progresso" },
  { value: "done", label: "Concluída" },
  { value: "archived", label: "Arquivada" },
];

const SCORE_FIELDS = [
  { name: "impact", label: "Impacto" },
  { name: "frequency", label: "Frequência" },
  { name: "severity", label: "Severidade" },
  { name: "businessPotential", label: "Potencial de negócio" },
  { name: "solutionEase", label: "Facilidade de solução" },
] as const;

export default async function OpportunityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { project, role } = await getPageContext();
  const [opp] = await db.select().from(opportunities).where(eq(opportunities.id, id)).limit(1);
  if (!opp || opp.projectId !== project.id) notFound();

  const [persona, hypothesis] = await Promise.all([
    opp.personaId ? db.select().from(personas).where(eq(personas.id, opp.personaId)).limit(1).then((r) => r[0]) : null,
    opp.hypothesisId
      ? db.select().from(hypotheses).where(eq(hypotheses.id, opp.hypothesisId)).limit(1).then((r) => r[0])
      : null,
  ]);

  const canEdit = role !== "viewer";

  return (
    <div className="max-w-3xl space-y-4">
      <PageHeader
        title={opp.title}
        description={opp.problemRef ?? undefined}
        actions={
          <>
            <Link href={`/opportunities/${opp.id}/doc`}>
              <Button variant="secondary">📄 PRD & User Stories</Button>
            </Link>
            <Link href={`/decisions/new?opportunityId=${opp.id}`}>
              <Button variant="secondary">Registrar decisão a partir desta oportunidade</Button>
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <p className="text-sm text-slate-700">{opp.description || "Sem descrição."}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {hypothesis && <Badge color="indigo">Hipótese: {hypothesis.title}</Badge>}
            {persona && <Badge color="violet">{persona.name}</Badge>}
          </div>
        </Card>
        <Card>
          <p className="text-xs text-slate-500">Score de priorização</p>
          <p className="text-3xl font-semibold text-slate-900">{opp.priorityScore ?? "—"}</p>
          <p className="mt-2 text-xs text-slate-500">
            Confiança de evidência herdada: <strong>{opp.evidenceConfidence}%</strong>
          </p>
          <p className="mt-2 text-[11px] leading-snug text-slate-400">
            Score = média(impacto, frequência, severidade, potencial de negócio, facilidade) × fator de
            confiança de evidência (50%–100%). Oportunidades sem hipótese/evidência real vinculada nunca
            atingem o multiplicador máximo.
          </p>
        </Card>
      </div>

      <Card>
        <p className="mb-2 text-sm font-semibold text-slate-700">Status</p>
        <form action={updateOpportunityStatus.bind(null, opp.id)} className="flex items-center gap-2">
          <Select name="status" defaultValue={opp.status} disabled={!canEdit} className="w-48">
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
          {canEdit && (
            <Button type="submit" size="sm" variant="secondary">
              Atualizar status
            </Button>
          )}
        </form>
      </Card>

      {canEdit && (
        <Card>
          <p className="mb-3 text-sm font-semibold text-slate-700">Editar oportunidade</p>
          <form action={updateOpportunityScores.bind(null, opp.id)}>
            <Field>
              <Label>Título</Label>
              <Input name="title" defaultValue={opp.title} />
            </Field>
            <Field>
              <Label>Descrição</Label>
              <Textarea name="description" rows={3} defaultValue={opp.description ?? ""} />
            </Field>
            <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {SCORE_FIELDS.map((f) => (
                <Field key={f.name}>
                  <Label>{f.label} (1-5)</Label>
                  <Select name={f.name} defaultValue={String(opp[f.name])}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </Select>
                </Field>
              ))}
            </div>
            <Button type="submit" variant="secondary">
              Salvar alterações
            </Button>
          </form>
        </Card>
      )}

      {opp.status === "done" && (
        <Card>
          <p className="mb-1 text-sm font-semibold text-slate-700">Resultado observado</p>
          {opp.outcomeCheckedAt ? (
            <>
              <p className="mb-1 text-xs text-slate-400">
                Registrado em {new Date(opp.outcomeCheckedAt).toLocaleDateString("pt-BR")}
              </p>
              <p className="text-sm text-slate-700">{opp.outcomeSummary}</p>
              {opp.outcomeEvidenceId && (
                <p className="mt-2 text-xs text-emerald-700">
                  ✓ Registrado como evidência real, contando no Confidence Score da hipótese de origem.
                </p>
              )}
            </>
          ) : (
            <>
              <p className="mb-3 text-xs text-slate-500">
                O que aconteceu de fato depois do lançamento? Fecha o ciclo entre o que foi previsto no
                discovery e o que a realidade confirmou (ou não).
              </p>
              {canEdit && (
                <form action={recordOpportunityOutcome.bind(null, opp.id)}>
                  <Field>
                    <Label>O que de fato aconteceu</Label>
                    <Textarea name="outcomeSummary" rows={3} required />
                  </Field>
                  {opp.hypothesisId && (
                    <>
                      <label className="mb-2 flex items-center gap-2 text-xs text-slate-600">
                        <input type="checkbox" name="logAsEvidence" value="true" defaultChecked />
                        Registrar isto como evidência real na hipótese de origem
                      </label>
                      <Field>
                        <Label>Isso confirma ou contradiz a hipótese original?</Label>
                        <Select name="outcomeFavorable" defaultValue="true">
                          <option value="true">Confirma</option>
                          <option value="false">Contradiz</option>
                        </Select>
                      </Field>
                    </>
                  )}
                  <Button type="submit" size="sm" variant="secondary">
                    Registrar resultado
                  </Button>
                </form>
              )}
            </>
          )}
        </Card>
      )}

      {opp.azureFeatureId && (
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">Azure DevOps</p>
            <a href={featureWebUrl(opp.azureFeatureId)} target="_blank" rel="noreferrer">
              <Button type="button" variant="secondary" size="sm">
                Ver card #{opp.azureFeatureId}
              </Button>
            </a>
          </div>

          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
            Sucesso da funcionalidade (teste A/B)
          </p>
          {role === "owner" ? (
            <form action={setAbTestDecision.bind(null, opp.id)} className="mb-4 flex items-center gap-2">
              <Select name="abTestDecision" defaultValue={opp.abTestDecision} className="w-56">
                {Object.entries(AB_DECISION_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
              <Button type="submit" size="sm" variant="secondary">
                Salvar
              </Button>
            </form>
          ) : (
            <div className="mb-4">
              <Badge color={AB_DECISION_COLORS[opp.abTestDecision]}>{AB_DECISION_LABELS[opp.abTestDecision]}</Badge>
            </div>
          )}
          <p className="mb-4 text-[11px] leading-snug text-slate-400">
            Também aparece como tag no card do Azure DevOps (prefixo &quot;ab:&quot;), pra quem só olha o
            board.
          </p>

          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
            Timeline planejada (usada no{" "}
            <Link href="/azure-devops/roadmap" className="text-indigo-600">
              Gráfico Gantt de roadmap
            </Link>
            )
          </p>
          {role === "owner" ? (
            <form action={updatePlannedDates.bind(null, opp.id)} className="flex flex-wrap items-end gap-2">
              <Field>
                <Label>Início planejado</Label>
                <Input type="date" name="plannedStartDate" defaultValue={toDateInputValue(opp.plannedStartDate)} />
              </Field>
              <Field>
                <Label>Entrega planejada</Label>
                <Input type="date" name="plannedEndDate" defaultValue={toDateInputValue(opp.plannedEndDate)} />
              </Field>
              <Button type="submit" size="sm" variant="secondary">
                Salvar datas
              </Button>
            </form>
          ) : (
            <p className="text-sm text-slate-600">
              {opp.plannedStartDate && opp.plannedEndDate
                ? `${new Date(opp.plannedStartDate).toLocaleDateString("pt-BR")} — ${new Date(
                    opp.plannedEndDate
                  ).toLocaleDateString("pt-BR")}`
                : "Datas ainda não definidas."}
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
