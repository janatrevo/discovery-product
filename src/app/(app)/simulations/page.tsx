import Link from "next/link";
import { getPageContext } from "@/lib/page-context";
import { db } from "@/db";
import { simulationRuns, hypotheses, products } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { Badge, Button, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { SimulationBanner } from "@/components/origin-badge";
import { deleteSimulation } from "./actions";

export default async function SimulationsPage() {
  const { project, role } = await getPageContext();
  const canDelete = role === "owner" || role === "editor";
  const [list, hypothesisList, productList] = await Promise.all([
    db.select().from(simulationRuns).where(eq(simulationRuns.projectId, project.id)).orderBy(desc(simulationRuns.createdAt)),
    db.select().from(hypotheses).where(eq(hypotheses.projectId, project.id)),
    db.select().from(products).where(eq(products.projectId, project.id)),
  ]);
  const hypothesisTitle = (id: string | null) => hypothesisList.find((h) => h.id === id)?.title;
  // Mostrado pra quem precisa achar "qual simulação está travando a exclusão
  // de tal produto" (ver checkProductDeletable em src/lib/delete-guards.ts) —
  // sem isso, não dava pra saber qual simulação da lista referenciava qual
  // produto.
  const productName = (id: string | null) => productList.find((p) => p.id === id)?.name;

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
          action={
            <Link href="/hypotheses">
              <Button size="sm">Ver hipóteses</Button>
            </Link>
          }
        />
      ) : (
        <div className="mt-4 space-y-2">
          {list.map((s) => (
            <Card key={s.id} className="hover:shadow-md">
              <div className="flex items-start justify-between gap-2">
                <Link href={`/simulations/${s.id}`} className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-slate-900">{s.scenario || "Cenário sem título"}</p>
                    {s.isMock && <Badge color="amber">modo demo</Badge>}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{s.task}</p>
                  {s.hypothesisId && (
                    <p className="mt-2 text-xs text-slate-400">Hipótese: {hypothesisTitle(s.hypothesisId)}</p>
                  )}
                  {s.productId && <p className="text-xs text-slate-400">Produto: {productName(s.productId)}</p>}
                </Link>
                {canDelete && (
                  <form action={deleteSimulation.bind(null, s.id, undefined)}>
                    <Button type="submit" variant="ghost" size="sm">
                      excluir
                    </Button>
                  </form>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
