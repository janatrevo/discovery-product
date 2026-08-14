import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/db";
import { decisions, opportunities, hypotheses, evidence } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { getPageContext } from "@/lib/page-context";
import { Badge, Card, PageHeader } from "@/components/ui/primitives";

export default async function DecisionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { project } = await getPageContext();
  const [decision] = await db.select().from(decisions).where(eq(decisions.id, id)).limit(1);
  if (!decision || decision.projectId !== project.id) notFound();

  const [opportunity, hypothesisList, evidenceList] = await Promise.all([
    decision.opportunityId
      ? db.select().from(opportunities).where(eq(opportunities.id, decision.opportunityId)).limit(1).then((r) => r[0])
      : null,
    decision.hypothesisRefs?.length
      ? db.select().from(hypotheses).where(inArray(hypotheses.id, decision.hypothesisRefs))
      : Promise.resolve([]),
    decision.evidenceRefs?.length
      ? db.select().from(evidence).where(inArray(evidence.id, decision.evidenceRefs))
      : Promise.resolve([]),
  ]);

  return (
    <div className="max-w-2xl space-y-4">
      <PageHeader
        title={decision.decisionText}
        description={`Decidido em ${new Date(decision.decidedAt).toLocaleString("pt-BR")}`}
      />

      {decision.overriddenMethodology && (
        <div className="rounded-md bg-amber-50 p-3 text-xs text-amber-800">
          Esta decisão foi tomada apesar da metodologia recomendada não ter sido totalmente seguida.
          Fica registrado para auditoria futura — não é um erro, é uma escolha explícita e rastreável.
        </div>
      )}

      <Card>
        <p className="mb-1 text-xs font-semibold text-slate-500">Racional</p>
        <p className="text-sm text-slate-700">{decision.rationale || "—"}</p>
      </Card>

      {opportunity && (
        <Card>
          <p className="mb-1 text-xs font-semibold text-slate-500">Oportunidade relacionada</p>
          <Link href={`/opportunities/${opportunity.id}`} className="text-sm font-medium text-indigo-600">
            {opportunity.title}
          </Link>
        </Card>
      )}

      {hypothesisList.length > 0 && (
        <Card>
          <p className="mb-2 text-xs font-semibold text-slate-500">Hipóteses referenciadas</p>
          <div className="flex flex-wrap gap-2">
            {hypothesisList.map((h) => (
              <Link key={h.id} href={`/hypotheses/${h.id}`}>
                <Badge color="indigo">{h.title}</Badge>
              </Link>
            ))}
          </div>
        </Card>
      )}

      {evidenceList.length > 0 && (
        <Card>
          <p className="mb-2 text-xs font-semibold text-slate-500">Evidências referenciadas</p>
          <ul className="space-y-1">
            {evidenceList.map((e) => (
              <li key={e.id} className="text-sm text-slate-700">
                [{e.type}] {e.source}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
