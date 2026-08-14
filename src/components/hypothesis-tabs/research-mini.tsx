import Link from "next/link";
import { db } from "@/db";
import { surveys, interviewGuides } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { Badge, Button, Card, EmptyState } from "@/components/ui/primitives";

export async function ResearchMiniList({ hypothesisId }: { hypothesisId: string; projectId: string }) {
  const [surveyList, guideList] = await Promise.all([
    db.select().from(surveys).where(eq(surveys.hypothesisId, hypothesisId)).orderBy(desc(surveys.createdAt)),
    db
      .select()
      .from(interviewGuides)
      .where(eq(interviewGuides.hypothesisId, hypothesisId))
      .orderBy(desc(interviewGuides.createdAt)),
  ]);

  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-700">Pesquisa quantitativa (surveys)</p>
          <Link href={`/research/surveys/new?hypothesisId=${hypothesisId}`}>
            <Button size="sm" variant="secondary">
              + Survey
            </Button>
          </Link>
        </div>
        {surveyList.length === 0 ? (
          <EmptyState title="Nenhum survey vinculado" />
        ) : (
          <ul className="space-y-1">
            {surveyList.map((s) => (
              <li key={s.id}>
                <Link href={`/research/surveys/${s.id}`} className="flex items-center justify-between text-sm hover:underline">
                  <span>{s.title}</span>
                  <Badge>{s.status}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-700">Pesquisa qualitativa (entrevistas)</p>
          <Link href={`/research/interviews/new?hypothesisId=${hypothesisId}`}>
            <Button size="sm" variant="secondary">
              + Roteiro
            </Button>
          </Link>
        </div>
        {guideList.length === 0 ? (
          <EmptyState title="Nenhum roteiro de entrevista vinculado" />
        ) : (
          <ul className="space-y-1">
            {guideList.map((g) => (
              <li key={g.id}>
                <Link href={`/research/interviews/${g.id}`} className="text-sm hover:underline">
                  {g.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
