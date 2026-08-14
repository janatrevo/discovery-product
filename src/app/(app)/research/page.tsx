import Link from "next/link";
import { getPageContext } from "@/lib/page-context";
import { db } from "@/db";
import { surveys, interviewGuides, usabilityTests, simulationRuns, experiments } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { Card, PageHeader } from "@/components/ui/primitives";

export default async function ResearchHubPage() {
  const { project } = await getPageContext();
  const pid = project.id;

  const counts = await Promise.all(
    [surveys, interviewGuides, usabilityTests, simulationRuns, experiments].map((t) =>
      db.select({ count: sql<number>`count(*)::int` }).from(t).where(eq(t.projectId, pid)).then((r) => r[0].count)
    )
  );
  const [surveyCount, interviewCount, usabilityCount, simulationCount, experimentCount] = counts;

  const cards = [
    { href: "/experiments", label: "Experimentos", count: experimentCount, description: "Método de validação formal com critério de sucesso travado antes do resultado." },
    { href: "/research/surveys", label: "Surveys", count: surveyCount, description: "Pesquisa quantitativa — incluindo detector de viés em perguntas tendenciosas." },
    { href: "/research/interviews", label: "Entrevistas", count: interviewCount, description: "Roteiros e transcrições com codificação qualitativa (assistida por IA, sempre confirmada por humano)." },
    { href: "/usability", label: "Usabilidade / Imagem", count: usabilityCount, description: "Testes de usabilidade e análise de wireframes/protótipos por IA — sempre marcados como simulação." },
    { href: "/simulations", label: "Simulações de persona", count: simulationCount, description: "Cenários simulados por IA — nunca contam como evidência real." },
  ];

  return (
    <div>
      <PageHeader
        title="Research & Testing"
        description="Todos os módulos de pesquisa e teste do projeto — quantitativo, qualitativo, usabilidade e simulação de IA."
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <Link key={c.href} href={c.href}>
            <Card className="h-full hover:shadow-md">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-800">{c.label}</p>
                <span className="text-lg font-semibold text-slate-900">{c.count}</span>
              </div>
              <p className="mt-2 text-xs text-slate-500">{c.description}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
