import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/db";
import { opportunities, productDocs, userStories } from "@/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { getPageContext } from "@/lib/page-context";
import { getFeature, getFeatureStates, type AzureFeature } from "@/lib/azure-devops";
import { arrayToLines } from "@/lib/list-utils";
import { Badge, Button, Card, Field, Input, Label, PageHeader, Select, Textarea } from "@/components/ui/primitives";
import { updateAzureFeature } from "../../actions";
import { sendToAzureDevOps } from "../../../opportunities/[id]/doc/actions";

export default async function EditAzureFeaturePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const featureId = Number(id);
  const { project, role } = await getPageContext();
  if (role !== "owner") redirect("/azure-devops");
  if (!Number.isFinite(featureId)) notFound();

  let feature: AzureFeature;
  let states: { name: string; category: string }[];
  try {
    [feature, states] = await Promise.all([getFeature(featureId), getFeatureStates()]);
  } catch (err) {
    return (
      <div>
        <PageHeader title={`Editar Feature #${featureId}`} />
        <Card className="max-w-2xl">
          <p className="text-sm text-red-600">
            {err instanceof Error ? err.message : "Não foi possível carregar esta Feature do Azure DevOps."}
          </p>
        </Card>
      </div>
    );
  }

  // Este card foi gerado a partir do PRD de alguma oportunidade? Se sim,
  // mostra os campos que só existem no discovery-app (Business Rules,
  // Acceptance Criteria, Success Metrics) — eles não são campos nativos do
  // Azure DevOps (ver src/lib/azure-feature-description.ts), então não
  // aparecem no formulário de edição genérico acima, só aqui, lidos direto
  // do PRD de origem.
  const [linkedOpportunity] = await db
    .select()
    .from(opportunities)
    .where(and(eq(opportunities.projectId, project.id), eq(opportunities.azureFeatureId, featureId)))
    .limit(1);

  let prdPanel = null;
  if (linkedOpportunity) {
    const [doc, stories] = await Promise.all([
      db.select().from(productDocs).where(eq(productDocs.opportunityId, linkedOpportunity.id)).limit(1).then((r) => r[0]),
      db
        .select()
        .from(userStories)
        .where(eq(userStories.opportunityId, linkedOpportunity.id))
        .orderBy(asc(userStories.orderIndex)),
    ]);
    const acceptanceCriteria = Array.from(
      new Set(stories.flatMap((s) => (s.acceptanceCriteria as string[]) ?? []).filter(Boolean))
    );
    prdPanel = { doc, acceptanceCriteria };
  }

  return (
    <div>
      <PageHeader
        title={`Editar Feature #${feature.id}`}
        description="As alterações são salvas direto no board Trevo Labs do Azure DevOps."
      />
      <Card className="max-w-2xl">
        <form action={updateAzureFeature.bind(null, featureId)}>
          <Field>
            <Label>Título</Label>
            <Input name="title" defaultValue={feature.title} required />
          </Field>
          <Field>
            <Label>Descrição</Label>
            <Textarea name="description" rows={5} defaultValue={feature.description} />
            <p className="mt-1 text-xs text-slate-400">
              {linkedOpportunity
                ? "Este card veio de um PRD — o texto aqui é HTML (por isso os <h3>/<li> aparecem crus). Para editar o conteúdo de verdade, use o painel do PRD abaixo ou a página da oportunidade."
                : "Card criado manualmente por aqui — sem PRD de origem, então sem Business Rules/Acceptance Criteria/Success Metrics."}
            </p>
          </Field>
          <Field>
            <Label>Estado</Label>
            <Select name="state" defaultValue={feature.state}>
              {states.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field>
            <Label>Tags (uma por linha)</Label>
            <Textarea name="tags" rows={2} defaultValue={arrayToLines(feature.tags)} />
          </Field>
          <div className="flex gap-2">
            <Button type="submit">Salvar</Button>
            {feature.url && (
              <a href={feature.url} target="_blank" rel="noreferrer">
                <Button type="button" variant="secondary">
                  Abrir no board
                </Button>
              </a>
            )}
          </div>
        </form>
      </Card>

      {linkedOpportunity ? (
        <Card className="mt-4 max-w-2xl">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-700">
              Campos do PRD — oportunidade &quot;{linkedOpportunity.title}&quot;
            </p>
            <Link href={`/opportunities/${linkedOpportunity.id}/doc`}>
              <Button type="button" variant="secondary" size="sm">
                Editar PRD
              </Button>
            </Link>
          </div>
          <p className="mb-4 text-xs text-slate-500">
            Business Rules, Acceptance Criteria e Success Metrics não são campos nativos do Azure DevOps — são
            gerados aqui a partir do PRD e escritos como seções dentro da própria Descrição do card (por isso
            não aparecem como campos separados no formulário acima). Para alterá-los, edite o PRD e reenvie.
          </p>

          {(
            [
              ["Business Rules", (prdPanel?.doc?.businessRules as string[]) ?? []],
              ["Acceptance Criteria", prdPanel?.acceptanceCriteria ?? []],
              ["Success Metrics", (prdPanel?.doc?.successMetrics as string[]) ?? []],
            ] as const
          ).map(([label, items]) => (
            <div key={label} className="mb-3">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
              {items.length > 0 ? (
                <ul className="list-inside list-disc text-sm text-slate-700">
                  {items.map((i, idx) => (
                    <li key={idx}>{i}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-400">Nenhum ainda — gere ou edite o PRD.</p>
              )}
            </div>
          ))}

          <form action={sendToAzureDevOps.bind(null, linkedOpportunity.id)} className="mt-2">
            <Button type="submit" size="sm" variant="secondary">
              Reenviar PRD atualizado para este card
            </Button>
          </form>
        </Card>
      ) : (
        <Card className="mt-4 max-w-2xl border-amber-300 bg-amber-50">
          <p className="text-sm text-amber-800">
            <Badge color="amber">Card manual</Badge> Este card não veio de uma oportunidade do discovery-app,
            então não tem Business Rules/Acceptance Criteria/Success Metrics para gerar. Para um card completo
            a partir de um PRD, vá em uma oportunidade → PRD & User Stories → &quot;Enviar como Feature ao
            Azure DevOps&quot;, em vez de criar por aqui em &quot;+ Nova Feature&quot;.
          </p>
        </Card>
      )}
    </div>
  );
}
