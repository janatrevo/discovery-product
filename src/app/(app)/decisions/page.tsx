import Link from "next/link";
import { getPageContext } from "@/lib/page-context";
import { db } from "@/db";
import { decisions, opportunities } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { Badge, Button, Card, EmptyState, PageHeader } from "@/components/ui/primitives";

export default async function DecisionsPage() {
  const { project } = await getPageContext();

  const [list, opportunityList] = await Promise.all([
    db.select().from(decisions).where(eq(decisions.projectId, project.id)).orderBy(desc(decisions.decidedAt)),
    db.select().from(opportunities).where(eq(opportunities.projectId, project.id)),
  ]);

  const opportunityTitle = (id: string | null) => opportunityList.find((o) => o.id === id)?.title;

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Decision Log"
        description="Registro append-only de decisões de produto — sempre com racional e vínculo à evidência/hipótese que sustentou a escolha."
        actions={
          <Link href="/decisions/new">
            <Button>+ Registrar decisão</Button>
          </Link>
        }
      />

      {list.length === 0 ? (
        <EmptyState
          title="Nenhuma decisão registrada ainda"
          description="Toda decisão relevante de produto deveria deixar um rastro do porquê — especialmente quando ela contradiz a metodologia recomendada."
          action={
            <Link href="/decisions/new">
              <Button>Registrar primeira decisão</Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {list.map((d) => (
            <Link key={d.id} href={`/decisions/${d.id}`}>
              <Card className="hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium text-slate-900">{d.decisionText}</p>
                  {d.overriddenMethodology && <Badge color="amber">metodologia sobreposta</Badge>}
                </div>
                {d.rationale && <p className="mt-1 text-xs text-slate-500 line-clamp-2">{d.rationale}</p>}
                <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                  <span>{opportunityTitle(d.opportunityId) ? `Oportunidade: ${opportunityTitle(d.opportunityId)}` : ""}</span>
                  <span>{new Date(d.decidedAt).toLocaleDateString("pt-BR")}</span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
