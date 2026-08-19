import Link from "next/link";
import { getPageContext } from "@/lib/page-context";
import { db } from "@/db";
import { experiments, hypotheses } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { Badge, Button, Card, EmptyState, PageHeader } from "@/components/ui/primitives";

const STATUS_COLOR: Record<string, "slate" | "sky" | "emerald"> = {
  planned: "slate",
  in_progress: "sky",
  completed: "emerald",
};

export default async function ExperimentsPage() {
  const { project } = await getPageContext();
  const [list, hypothesisList] = await Promise.all([
    db.select().from(experiments).where(eq(experiments.projectId, project.id)).orderBy(desc(experiments.createdAt)),
    db.select().from(hypotheses).where(eq(hypotheses.projectId, project.id)),
  ]);
  const hypothesisTitle = (id: string) => hypothesisList.find((h) => h.id === id)?.title;

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Experimentos"
        description="Todo experimento nasce vinculado a uma hipótese, com critério de sucesso travado antes do resultado — evita mover o alvo depois de ver o dado."
      />
      {list.length === 0 ? (
        <EmptyState
          title="Nenhum experimento ainda"
          description="Crie experimentos a partir da aba 'Experimentos' de uma hipótese."
          action={
            <Link href="/hypotheses">
              <Button size="sm">Ver hipóteses</Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-2">
          {list.map((e) => (
            <Link key={e.id} href={`/experiments/${e.id}`}>
              <Card className="hover:shadow-md">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-slate-900">{e.method}</p>
                  <Badge color={STATUS_COLOR[e.status] ?? "slate"}>{e.status}</Badge>
                </div>
                <p className="mt-1 text-xs text-slate-500">{e.objective}</p>
                <p className="mt-2 text-xs text-slate-400">Hipótese: {hypothesisTitle(e.hypothesisId) ?? "—"}</p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
