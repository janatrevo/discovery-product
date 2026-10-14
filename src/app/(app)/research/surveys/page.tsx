import Link from "next/link";
import { getPageContext } from "@/lib/page-context";
import { db } from "@/db";
import { surveys } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { Badge, Button, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { evaluateSurveyAvailability } from "@/lib/survey-window";
import { hypothesesBySurveyIds } from "@/lib/research-links";

const STATUS_COLOR: Record<string, "slate" | "sky" | "emerald" | "amber"> = {
  draft: "slate",
  published: "sky",
  closed: "emerald",
  expired: "amber",
};

export default async function SurveysPage() {
  const { project } = await getPageContext();
  const list = await db.select().from(surveys).where(eq(surveys.projectId, project.id)).orderBy(desc(surveys.createdAt));
  const hypothesesBySurvey = await hypothesesBySurveyIds(list.map((s) => s.id));

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
          {list.map((s) => {
            // "expirado" aqui é só um rótulo calculado pra exibição — não
            // grava nada. O status de verdade só vira "closed" no banco
            // quando alguém abre o link público ou a tela de detalhe desse
            // survey (ver closeSurveyIfWindowExpired em survey-window.ts).
            const availability = evaluateSurveyAvailability(s);
            const displayStatus =
              s.status === "published" && !availability.open && availability.reason === "ended" ? "expired" : s.status;
            const displayLabel = displayStatus === "expired" ? "prazo encerrado" : s.status;
            return (
              <Link key={s.id} href={`/research/surveys/${s.id}`}>
                <Card className="hover:shadow-md">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-slate-900">{s.title}</p>
                    <Badge color={STATUS_COLOR[displayStatus] ?? "slate"}>{displayLabel}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{s.objective}</p>
                  {(hypothesesBySurvey.get(s.id)?.length ?? 0) > 0 && (
                    <p className="mt-2 text-xs text-slate-400">
                      {hypothesesBySurvey.get(s.id)!.length === 1 ? "Hipótese" : "Hipóteses"}:{" "}
                      {hypothesesBySurvey.get(s.id)!.map((h) => h.title).join(" · ")}
                    </p>
                  )}
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
