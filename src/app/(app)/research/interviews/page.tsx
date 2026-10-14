import Link from "next/link";
import { getPageContext } from "@/lib/page-context";
import { db } from "@/db";
import { interviewGuides, interviews } from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { Badge, Button, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { hypothesesByGuideIds } from "@/lib/research-links";

export default async function InterviewGuidesPage() {
  const { project } = await getPageContext();
  const [list, interviewCounts] = await Promise.all([
    db.select().from(interviewGuides).where(eq(interviewGuides.projectId, project.id)).orderBy(desc(interviewGuides.createdAt)),
    db
      .select({ guideId: interviews.guideId, count: sql<number>`count(*)::int` })
      .from(interviews)
      .where(eq(interviews.projectId, project.id))
      .groupBy(interviews.guideId),
  ]);
  const hypothesesByGuide = await hypothesesByGuideIds(list.map((g) => g.id));
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
          action={
            <Link href="/hypotheses">
              <Button size="sm">Ver hipóteses</Button>
            </Link>
          }
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
                {(hypothesesByGuide.get(g.id)?.length ?? 0) > 0 && (
                  <p className="mt-2 text-xs text-slate-400">
                    {hypothesesByGuide.get(g.id)!.length === 1 ? "Hipótese" : "Hipóteses"}:{" "}
                    {hypothesesByGuide.get(g.id)!.map((h) => h.title).join(" · ")}
                  </p>
                )}
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
