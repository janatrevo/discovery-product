import Link from "next/link";
import { getPageContext } from "@/lib/page-context";
import { db } from "@/db";
import { usabilityTests, hypotheses } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { Button, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { SimulationBanner } from "@/components/origin-badge";

export default async function UsabilityTestsPage() {
  const { project } = await getPageContext();
  const [list, hypothesisList] = await Promise.all([
    db.select().from(usabilityTests).where(eq(usabilityTests.projectId, project.id)).orderBy(desc(usabilityTests.createdAt)),
    db.select().from(hypotheses).where(eq(hypotheses.projectId, project.id)),
  ]);
  const hypothesisTitle = (id: string | null) => hypothesisList.find((h) => h.id === id)?.title;

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Usabilidade / Image Test Studio"
        description="Análise de screenshots, wireframes e protótipos por IA a partir da perspectiva de uma persona — sempre marcada como simulação, nunca como teste com usuário real."
      />
      <SimulationBanner mode="image" />
      {list.length === 0 ? (
        <EmptyState
          title="Nenhum teste de usabilidade ainda"
          description="Crie um teste a partir da aba 'Simulações' de uma hipótese, ou envie uma imagem para análise."
          action={
            <Link href="/hypotheses">
              <Button size="sm">Ver hipóteses</Button>
            </Link>
          }
        />
      ) : (
        <div className="mt-4 space-y-2">
          {list.map((t) => (
            <Link key={t.id} href={`/usability/${t.id}`}>
              <Card className="hover:shadow-md">
                <p className="text-sm font-medium text-slate-900">{t.title}</p>
                <p className="mt-1 text-xs text-slate-500">{t.task}</p>
                {t.hypothesisId && <p className="mt-2 text-xs text-slate-400">Hipótese: {hypothesisTitle(t.hypothesisId)}</p>}
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
