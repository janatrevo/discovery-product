import Link from "next/link";
import { getPageContext } from "@/lib/page-context";
import { db } from "@/db";
import { simulationRuns, hypotheses } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { SimulationBanner } from "@/components/origin-badge";

export default async function SimulationsPage() {
  const { project } = await getPageContext();
  const [list, hypothesisList] = await Promise.all([
    db.select().from(simulationRuns).where(eq(simulationRuns.projectId, project.id)).orderBy(desc(simulationRuns.createdAt)),
    db.select().from(hypotheses).where(eq(hypotheses.projectId, project.id)),
  ]);
  const hypothesisTitle = (id: string | null) => hypothesisList.find((h) => h.id === id)?.title;

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Persona Simulation Engine"
        description="Simulações de cenário com IA respondendo como uma persona reagiria — sinal exploratório para gerar hipóteses, nunca evidência de validação."
      />
      <SimulationBanner mode="scenario" />
      {list.length === 0 ? (
        <EmptyState
          title="Nenhuma simulação ainda"
          description="Crie uma simulação a partir da aba 'Simulações' de uma hipótese."
        />
      ) : (
        <div className="mt-4 space-y-2">
          {list.map((s) => (
            <Link key={s.id} href={`/simulations/${s.id}`}>
              <Card className="hover:shadow-md">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-slate-900">{s.scenario || "Cenário sem título"}</p>
                  {s.isMock && <Badge color="amber">modo demo</Badge>}
                </div>
                <p className="mt-1 text-xs text-slate-500">{s.task}</p>
                {s.hypothesisId && <p className="mt-2 text-xs text-slate-400">Hipótese: {hypothesisTitle(s.hypothesisId)}</p>}
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
