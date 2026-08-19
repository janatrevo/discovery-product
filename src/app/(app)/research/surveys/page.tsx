import Link from "next/link";
import { getPageContext } from "@/lib/page-context";
import { db } from "@/db";
import { surveys, hypotheses } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { Badge, Button, Card, EmptyState, PageHeader } from "@/components/ui/primitives";

const STATUS_COLOR: Record<string, "slate" | "sky" | "emerald"> = {
  draft: "slate",
  published: "sky",
  closed: "emerald",
};

export default async function SurveysPage() {
  const { project } = await getPageContext();
  const [list, hypothesisList] = await Promise.all([
    db.select().from(surveys).where(eq(surveys.projectId, project.id)).orderBy(desc(surveys.createdAt)),
    db.select().from(hypotheses).where(eq(hypotheses.projectId, project.id)),
  ]);
  const hypothesisTitle = (id: string | null) => hypothesisList.find((h) => h.id === id)?.title;

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Surveys"
        description="Pesquisa quantitativa — cada pergunta passa por um checador de viés antes de publicar; perguntas tendenciosas ficam marcadas mesmo depois."
      />
      {list.length === 0 ? (
        <EmptyState
          title="Nenhum survey ainda"
          description="Crie um survey a partir da aba 'Pesquisa' de uma hipótese."
          action={
            <Link href="/hypotheses">
              <Button size="sm">Ver hipóteses</Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-2">
          {list.map((s) => (
            <Link key={s.id} href={`/research/surveys/${s.id}`}>
              <Card className="hover:shadow-md">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-slate-900">{s.title}</p>
                  <Badge color={STATUS_COLOR[s.status] ?? "slate"}>{s.status}</Badge>
                </div>
                <p className="mt-1 text-xs text-slate-500">{s.objective}</p>
                {s.hypothesisId && <p className="mt-2 text-xs text-slate-400">Hipótese: {hypothesisTitle(s.hypothesisId)}</p>}
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
