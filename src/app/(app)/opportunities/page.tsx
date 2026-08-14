import Link from "next/link";
import { getPageContext } from "@/lib/page-context";
import { db } from "@/db";
import { opportunities, personas, hypotheses } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { Badge, Button, Card, EmptyState, PageHeader } from "@/components/ui/primitives";

const COLUMNS: { value: string; label: string }[] = [
  { value: "new", label: "Novas" },
  { value: "prioritized", label: "Priorizadas" },
  { value: "in_progress", label: "Em progresso" },
  { value: "done", label: "Concluídas" },
  { value: "archived", label: "Arquivadas" },
];

export default async function OpportunitiesPage() {
  const { project } = await getPageContext();

  const [list, personaList, hypothesisList] = await Promise.all([
    db
      .select()
      .from(opportunities)
      .where(eq(opportunities.projectId, project.id))
      .orderBy(desc(opportunities.priorityScore)),
    db.select().from(personas).where(eq(personas.projectId, project.id)),
    db.select().from(hypotheses).where(eq(hypotheses.projectId, project.id)),
  ]);

  const personaName = (id: string | null) => personaList.find((p) => p.id === id)?.name;
  const hypothesisTitle = (id: string | null) => hypothesisList.find((h) => h.id === id)?.title;

  return (
    <div>
      <PageHeader
        title="Discovery Board"
        description="Mapa de oportunidades priorizado por impacto, frequência, severidade, potencial de negócio, facilidade de solução — ponderado pela confiança de evidência real por trás."
        actions={
          <Link href="/opportunities/new">
            <Button>+ Nova oportunidade</Button>
          </Link>
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
        <div className="flex gap-4 overflow-x-auto pb-4">
          {COLUMNS.map((col) => {
            const items = list.filter((o) => o.status === col.value);
            return (
              <div key={col.value} className="w-72 shrink-0 rounded-xl bg-slate-100/60 p-2">
                <div className="mb-2 flex items-center justify-between px-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{col.label}</span>
                  <span className="text-xs text-slate-400">{items.length}</span>
                </div>
                <div className="space-y-2">
                  {items.map((o) => (
                    <Link key={o.id} href={`/opportunities/${o.id}`}>
                      <Card className="hover:shadow-md">
                        <p className="text-sm font-medium text-slate-900">{o.title}</p>
                        {hypothesisTitle(o.hypothesisId) && (
                          <p className="mt-1 text-xs text-slate-400">Hipótese: {hypothesisTitle(o.hypothesisId)}</p>
                        )}
                        {personaName(o.personaId) && <Badge color="indigo">{personaName(o.personaId)}</Badge>}
                        <div className="mt-2 flex items-center justify-between">
                          <span className="text-xs font-semibold text-slate-700">
                            Score: {o.priorityScore ?? "—"}
                          </span>
                          <span className="text-xs text-slate-400">Evidência: {o.evidenceConfidence}%</span>
                        </div>
                      </Card>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
