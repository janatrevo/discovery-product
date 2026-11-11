import Link from "next/link";
import { getPageContext } from "@/lib/page-context";
import { db } from "@/db";
import { opportunities, personas, hypotheses } from "@/db/schema";
import { eq, asc, desc } from "drizzle-orm";
import { Button, EmptyState, PageHeader } from "@/components/ui/primitives";
import { OpportunityBoard, type OpportunityCardData } from "@/components/opportunity-board";

const COLUMNS: { value: string; label: string }[] = [
  { value: "new", label: "Novas" },
  { value: "prioritized", label: "Priorizadas" },
  { value: "in_progress", label: "Em progresso" },
  { value: "done", label: "Concluídas" },
  { value: "archived", label: "Arquivadas" },
];

// ordem=manual (padrão): a ordem que a equipe montou arrastando os cards
// (empates caem no score). ordem=score: só pelo score de priorização, sem
// arrastar.
export default async function OpportunitiesPage({ searchParams }: { searchParams: Promise<{ ordem?: string }> }) {
  const { project, role } = await getPageContext();
  const { ordem = "manual" } = await searchParams;
  const byScore = ordem === "score";

  const [list, personaList, hypothesisList] = await Promise.all([
    db
      .select()
      .from(opportunities)
      .where(eq(opportunities.projectId, project.id))
      .orderBy(
        ...(byScore
          ? [desc(opportunities.priorityScore)]
          : [asc(opportunities.boardOrder), desc(opportunities.priorityScore)])
      ),
    db.select().from(personas).where(eq(personas.projectId, project.id)),
    db.select().from(hypotheses).where(eq(hypotheses.projectId, project.id)),
  ]);

  const personaName = (id: string | null) => personaList.find((p) => p.id === id)?.name;
  const hypothesisTitle = (id: string | null) => hypothesisList.find((h) => h.id === id)?.title;

  const itemsByStatus: Record<string, OpportunityCardData[]> = {};
  for (const col of COLUMNS) {
    itemsByStatus[col.value] = list
      .filter((o) => o.status === col.value)
      .map((o) => ({
        id: o.id,
        title: o.title,
        hypothesisTitle: hypothesisTitle(o.hypothesisId),
        personaName: personaName(o.personaId),
        priorityScore: o.priorityScore,
        evidenceConfidence: o.evidenceConfidence ?? 0,
      }));
  }

  const canEdit = role !== "viewer" && !byScore;
  const canDelete = role === "owner" || role === "editor";

  return (
    <div>
      <PageHeader
        title="Discovery Board"
        description="Mapa de oportunidades (as features do Trevo One). Arraste os cards para definir a ordem de construção; o score de priorização (impacto, frequência, severidade, potencial de negócio e facilidade, ponderado pela confiança de evidência) fica como referência."
        actions={
          <>
            <div className="flex items-center gap-1 text-xs text-slate-500">
              <span>Ordenar:</span>
              <Link
                href="/opportunities?ordem=manual"
                className={byScore ? "rounded px-2 py-1 hover:bg-slate-100" : "rounded bg-slate-200 px-2 py-1 font-medium text-slate-800"}
              >
                Minha ordem
              </Link>
              <Link
                href="/opportunities?ordem=score"
                className={byScore ? "rounded bg-slate-200 px-2 py-1 font-medium text-slate-800" : "rounded px-2 py-1 hover:bg-slate-100"}
              >
                Prioridade (score)
              </Link>
            </div>
            <Link href="/opportunities/new">
              <Button>+ Nova oportunidade</Button>
            </Link>
          </>
        }
      />

      {list.length === 0 ? (
        <EmptyState
          title="Nenhuma oportunidade mapeada ainda"
          description="Transforme uma hipótese validada (ou um insight de pesquisa) em uma oportunidade priorizável."
          action={
            <Link href="/opportunities/new">
              <Button>Mapear primeira oportunidade</Button>
            </Link>
          }
        />
      ) : (
        <OpportunityBoard
          key={ordem}
          columns={COLUMNS}
          itemsByStatus={itemsByStatus}
          canEdit={canEdit}
          canDelete={canDelete}
        />
      )}
    </div>
  );
}
