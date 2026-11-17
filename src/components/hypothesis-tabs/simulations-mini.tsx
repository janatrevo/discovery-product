import Link from "next/link";
import { db } from "@/db";
import { simulationRuns, usabilityTests } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { Button, Card, EmptyState } from "@/components/ui/primitives";
import { OriginBadge } from "@/components/origin-badge";
import { unlinkHypothesisFromSimulation } from "@/app/(app)/simulations/actions";
import { unlinkHypothesisFromTest } from "@/app/(app)/usability/actions";

export async function SimulationsMiniList({
  hypothesisId,
  canManage = false,
}: {
  hypothesisId: string;
  projectId: string;
  canManage?: boolean;
}) {
  const [list, usabilityList] = await Promise.all([
    db.select().from(simulationRuns).where(eq(simulationRuns.hypothesisId, hypothesisId)).orderBy(desc(simulationRuns.createdAt)),
    db.select().from(usabilityTests).where(eq(usabilityTests.hypothesisId, hypothesisId)).orderBy(desc(usabilityTests.createdAt)),
  ]);

  return (
    <div className="space-y-3">
      <div className="rounded-md bg-amber-50 p-3 text-xs text-amber-800">
        Simulações nunca contam como evidência real — aparecem aqui apenas como sinal exploratório
        que pode ter inspirado a investigação desta hipótese.
      </div>
      <div className="flex justify-end gap-2">
        <Link href={`/usability/new?hypothesisId=${hypothesisId}`}>
          <Button variant="secondary">+ Testar imagem/wireframe</Button>
        </Link>
        <Link href={`/simulations/new?hypothesisId=${hypothesisId}`}>
          <Button variant="secondary">+ Nova simulação de cenário</Button>
        </Link>
      </div>
      {list.length === 0 && usabilityList.length === 0 ? (
        <EmptyState title="Nenhuma simulação vinculada" />
      ) : (
        <>
          {list.map((s) => (
            <Card key={s.id} className="hover:shadow-md">
              <div className="flex items-start justify-between gap-3">
                <Link href={`/simulations/${s.id}`} className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-800">Cenário</p>
                    <OriginBadge originClass="simulation" />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{s.scenario}</p>
                </Link>
                {canManage && (
                  <form action={unlinkHypothesisFromSimulation.bind(null, s.id, hypothesisId)}>
                    <Button type="submit" variant="ghost" size="sm">
                      desvincular
                    </Button>
                  </form>
                )}
              </div>
            </Card>
          ))}
          {usabilityList.map((t) => (
            <Card key={t.id} className="hover:shadow-md">
              <div className="flex items-start justify-between gap-3">
                <Link href={`/usability/${t.id}`} className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-800">{t.title}</p>
                    <OriginBadge originClass="simulation" />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{t.task}</p>
                </Link>
                {canManage && (
                  <form action={unlinkHypothesisFromTest.bind(null, t.id, hypothesisId)}>
                    <Button type="submit" variant="ghost" size="sm">
                      desvincular
                    </Button>
                  </form>
                )}
              </div>
            </Card>
          ))}
        </>
      )}
    </div>
  );
}
