import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { opportunities, productDocs, userStories, hypotheses } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { getPageContext } from "@/lib/page-context";
import { isAiEnabled } from "@/lib/ai";
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  Label,
  PageHeader,
  Select,
  Textarea,
} from "@/components/ui/primitives";
import { arrayToLines } from "@/lib/list-utils";
import { featureWebUrl } from "@/lib/azure-devops";
import {
  generateProductDoc,
  updateProductDoc,
  markDocReviewed,
  addUserStory,
  confirmUserStory,
  toggleStoryDone,
  deleteUserStory,
  sendToAzureDevOps,
} from "./actions";

const PRIORITY_LABELS: Record<string, string> = {
  must: "Deve ter",
  should: "Deveria ter",
  could: "Poderia ter",
};

const PRIORITY_COLORS: Record<string, "red" | "amber" | "slate"> = {
  must: "red",
  should: "amber",
  could: "slate",
};

export default async function ProductDocPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { project, role } = await getPageContext();
  const [opp] = await db.select().from(opportunities).where(eq(opportunities.id, id)).limit(1);
  if (!opp || opp.projectId !== project.id) notFound();

  const [doc, stories, hypothesis] = await Promise.all([
    db.select().from(productDocs).where(eq(productDocs.opportunityId, id)).limit(1).then((r) => r[0]),
    db.select().from(userStories).where(eq(userStories.opportunityId, id)).orderBy(asc(userStories.orderIndex)),
    opp.hypothesisId ? db.select().from(hypotheses).where(eq(hypotheses.id, opp.hypothesisId)).limit(1).then((r) => r[0]) : null,
  ]);

  const canEdit = role !== "viewer";
  const unconfirmedCount = stories.filter((s) => s.aiGenerated && !s.confirmed).length;

  return (
    <div className="max-w-3xl space-y-4">
      <PageHeader
        title={`PRD & User Stories — ${opp.title}`}
        description="Rascunho estruturado ligado ao que já foi validado nesta oportunidade — nunca substitui a revisão humana antes de ir para engenharia."
        actions={
          <>
            <Link href={`/opportunities/${id}/doc/export`} target="_blank">
              <Button variant="secondary">Exportar Markdown</Button>
            </Link>
            <Link href={`/opportunities/${id}`}>
              <Button variant="secondary">← Voltar à oportunidade</Button>
            </Link>
          </>
        }
      />

      {!opp.hypothesisId && (
        <Card className="border-amber-300 bg-amber-50">
          <p className="text-sm text-amber-800">
            Esta oportunidade não tem hipótese vinculada — o rascunho por IA ainda funciona, mas sem
            evidência real por trás para se basear. Considere vincular uma hipótese na página da
            oportunidade antes de gerar.
          </p>
        </Card>
      )}

      <Card>
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-slate-700">Rascunho por IA</p>
            {doc && (
              <p className="mt-1 text-xs text-slate-500">
                {doc.generatedBy === "ai_generated" && "Gerado por IA — ainda não editado ou revisado por um humano."}
                {doc.generatedBy === "ai_assisted" && "Gerado por IA e já editado por um humano."}
                {doc.generatedBy === "human" && "Escrito manualmente."}
                {doc.reviewedAt && ` · revisado em ${new Date(doc.reviewedAt).toLocaleDateString("pt-BR")}`}
              </p>
            )}
          </div>
          {canEdit && (
            <form action={generateProductDoc.bind(null, id)}>
              <Button type="submit" size="sm" variant="secondary">
                {doc ? "Gerar novo rascunho" : "Gerar rascunho com IA"}
                {!isAiEnabled() && " (modo demo)"}
              </Button>
            </form>
          )}
        </div>

        {canEdit ? (
          <form action={updateProductDoc.bind(null, id)} className="space-y-3">
            <Field>
              <Label>Objetivos (um por linha)</Label>
              <Textarea name="goals" rows={3} defaultValue={arrayToLines(doc?.goals as string[])} />
            </Field>
            <Field>
              <Label>Fora de escopo (um por linha)</Label>
              <Textarea name="nonGoals" rows={3} defaultValue={arrayToLines(doc?.nonGoals as string[])} />
            </Field>
            <Field>
              <Label>Perguntas em aberto (uma por linha)</Label>
              <Textarea name="openQuestions" rows={3} defaultValue={arrayToLines(doc?.openQuestions as string[])} />
            </Field>
            <Field>
              <Label>Business Rules (uma por linha)</Label>
              <Textarea name="businessRules" rows={3} defaultValue={arrayToLines(doc?.businessRules as string[])} />
            </Field>
            <Field>
              <Label>Success Metrics (uma por linha)</Label>
              <Textarea name="successMetrics" rows={3} defaultValue={arrayToLines(doc?.successMetrics as string[])} />
            </Field>
            <div className="flex gap-2">
              <Button type="submit" size="sm">
                Salvar
              </Button>
              {doc && !doc.reviewedAt && (
                <Button type="submit" size="sm" variant="secondary" formAction={markDocReviewed.bind(null, id)}>
                  Marcar documento como revisado
                </Button>
              )}
            </div>
          </form>
        ) : (
          <div className="space-y-3 text-sm text-slate-700">
            {[
              ["Objetivos", doc?.goals as string[] | undefined],
              ["Fora de escopo", doc?.nonGoals as string[] | undefined],
              ["Perguntas em aberto", doc?.openQuestions as string[] | undefined],
              ["Business Rules", doc?.businessRules as string[] | undefined],
              ["Success Metrics", doc?.successMetrics as string[] | undefined],
            ].map(([label, items]) => (
              <div key={label as string}>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label as string}</p>
                {items && (items as string[]).length ? (
                  <ul className="list-inside list-disc">
                    {(items as string[]).map((g, i) => (
                      <li key={i}>{g}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-slate-400">Nenhum ainda.</p>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-700">
            User Stories ({stories.length})
            {unconfirmedCount > 0 && (
              <span className="ml-2 text-xs font-normal text-amber-700">
                {unconfirmedCount} sugestão(ões) de IA aguardando confirmação
              </span>
            )}
          </p>
        </div>

        {stories.length === 0 ? (
          <p className="text-sm text-slate-400">Nenhuma story ainda.</p>
        ) : (
          <ul className="mb-4 space-y-2">
            {stories.map((s) => (
              <li key={s.id} className="rounded-md border border-slate-100 p-3 text-sm">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <Badge color={PRIORITY_COLORS[s.priority] ?? "slate"}>{PRIORITY_LABELS[s.priority] ?? s.priority}</Badge>
                  {s.aiGenerated && !s.confirmed && <Badge color="amber">sugestão de IA — não confirmada</Badge>}
                  {s.done && <Badge color="emerald">concluída</Badge>}
                </div>
                <p className="text-slate-800">
                  Como <strong>{s.asA || "usuário"}</strong>, eu quero {s.iWant}
                  {s.soThat && <> para que {s.soThat}</>}.
                </p>
                {(s.acceptanceCriteria as string[])?.length > 0 && (
                  <ul className="mt-1 list-inside list-disc text-xs text-slate-500">
                    {(s.acceptanceCriteria as string[]).map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                )}
                {canEdit && (
                  <div className="mt-2 flex flex-wrap gap-3 text-xs">
                    {s.aiGenerated && !s.confirmed && (
                      <form action={confirmUserStory.bind(null, s.id)}>
                        <button className="text-emerald-600 hover:underline">confirmar</button>
                      </form>
                    )}
                    <form action={toggleStoryDone.bind(null, s.id, !s.done)}>
                      <button className="text-indigo-600 hover:underline">
                        {s.done ? "reabrir" : "marcar concluída"}
                      </button>
                    </form>
                    <form action={deleteUserStory.bind(null, s.id)}>
                      <button className="text-red-500 hover:underline">remover</button>
                    </form>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {canEdit && (
          <form action={addUserStory.bind(null, id)} className="grid grid-cols-1 gap-2 rounded-md bg-slate-50 p-3 sm:grid-cols-2">
            <Field>
              <Label>Como (papel)</Label>
              <Input name="asA" placeholder="usuário, admin, visitante..." defaultValue="usuário" />
            </Field>
            <Field>
              <Label>Prioridade</Label>
              <Select name="priority" defaultValue="should">
                <option value="must">Deve ter</option>
                <option value="should">Deveria ter</option>
                <option value="could">Poderia ter</option>
              </Select>
            </Field>
            <div className="sm:col-span-2">
              <Field>
                <Label>Eu quero</Label>
                <Input name="iWant" required placeholder="concluir a compra em menos de 3 passos" />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field>
                <Label>Para que</Label>
                <Input name="soThat" placeholder="eu não desista no meio do checkout" />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field>
                <Label>Critérios de aceite (um por linha)</Label>
                <Textarea name="acceptanceCriteria" rows={2} />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" variant="secondary">
                + Adicionar story
              </Button>
            </div>
          </form>
        )}
      </Card>

      {role === "owner" && (
        <Card>
          <p className="mb-1 text-sm font-semibold text-slate-700">Azure DevOps</p>
          <p className="mb-3 text-xs text-slate-500">
            Cria (ou atualiza) um card Feature no board Trevo Labs com este PRD — Description recebe o
            contexto, objetivos e user stories; Business Rules, Acceptance Criteria e Success Metrics
            entram como seções próprias dentro do card.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <form action={sendToAzureDevOps.bind(null, id)}>
              <Button type="submit" size="sm" disabled={!doc}>
                {opp.azureFeatureId ? "Atualizar Feature no Azure DevOps" : "Enviar como Feature ao Azure DevOps"}
              </Button>
            </form>
            {opp.azureFeatureId && (
              <a href={featureWebUrl(opp.azureFeatureId)} target="_blank" rel="noreferrer">
                <Button type="button" variant="secondary" size="sm">
                  Ver card #{opp.azureFeatureId}
                </Button>
              </a>
            )}
          </div>
          {!doc && <p className="mt-2 text-xs text-amber-700">Gere ou escreva o PRD acima antes de enviar.</p>}
        </Card>
      )}

      {hypothesis && (
        <p className="text-xs text-slate-400">
          Baseado na hipótese{" "}
          <Link href={`/hypotheses/${hypothesis.id}`} className="text-indigo-600">
            {hypothesis.title}
          </Link>
          .
        </p>
      )}
    </div>
  );
}
