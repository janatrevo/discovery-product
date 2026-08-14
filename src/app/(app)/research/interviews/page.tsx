import Link from "next/link";
import { getPageContext } from "@/lib/page-context";
import { db } from "@/db";
import { interviewGuides, interviews, hypotheses } from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/primitives";

export default async function InterviewGuidesPage() {
  const { project } = await getPageContext();
  const [list, hypothesisList, interviewCounts] = await Promise.all([
    db.select().from(interviewGuides).where(eq(interviewGuides.projectId, project.id)).orderBy(desc(interviewGuides.createdAt)),
    db.select().from(hypotheses).where(eq(hypotheses.projectId, project.id)),
    db
      .select({ guideId: interviews.guideId, count: sql<number>`count(*)::int` })
      .from(interviews)
      .where(eq(interviews.projectId, project.id))
      .groupBy(interviews.guideId),
  ]);
  const hypothesisTitle = (id: string | null) => hypothesisList.find((h) => h.id === id)?.title;
  const countFor = (guideId: string) => interviewCounts.find((c) => c.guideId === guideId)?.count ?? 0;

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Roteiros de entrevista"
        description="Pesquisa qualitativa — cada roteiro guarda as entrevistas realizadas, transcrições e codificação (sugerida por IA, sempre confirmada por humano antes de contar como padrão)."
      />
      {list.length === 0 ? (
        <EmptyState
          title="Nenhum roteiro de entrevista ainda"
          description="Crie um roteiro a partir da aba 'Pesquisa' de uma hipótese."
        />
      ) : (
        <div className="space-y-2">
          {list.map((g) => (
            <Link key={g.id} href={`/research/interviews/${g.id}`}>
              <Card className="hover:shadow-md">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-slate-900">{g.title}</p>
                  <Badge color="indigo">{countFor(g.id)} entrevista(s)</Badge>
                </div>
                <p className="mt-1 text-xs text-slate-500">{g.objective}</p>
                {g.hypothesisId && <p className="mt-2 text-xs text-slate-400">Hipótese: {hypothesisTitle(g.hypothesisId)}</p>}
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
