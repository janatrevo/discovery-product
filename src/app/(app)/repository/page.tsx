import Link from "next/link";
import { getPageContext } from "@/lib/page-context";
import { db } from "@/db";
import { evidence, personas, hypotheses, hypothesisEvidence, patternAnalyses } from "@/db/schema";
import { eq, desc, inArray } from "drizzle-orm";
import { Badge, Button, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { OriginBadge } from "@/components/origin-badge";
import { analyzePatterns } from "./actions";
import type { EvidencePattern } from "@/lib/ai";

export default async function RepositoryPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; origin?: string }>;
}) {
  const { type, origin } = await searchParams;
  const { project, role } = await getPageContext();

  const [list, personaList, latestAnalysisRows] = await Promise.all([
    db.select().from(evidence).where(eq(evidence.projectId, project.id)).orderBy(desc(evidence.evidenceDate)),
    db.select().from(personas).where(eq(personas.projectId, project.id)),
    db
      .select()
      .from(patternAnalyses)
      .where(eq(patternAnalyses.projectId, project.id))
      .orderBy(desc(patternAnalyses.createdAt))
      .limit(1),
  ]);
  const latestAnalysis = latestAnalysisRows[0];
  const realEvidenceCount = list.filter((e) => e.originClass === "real_data").length;
  const patterns = (latestAnalysis?.patternsJson as { patterns: EvidencePattern[] } | undefined)?.patterns ?? [];

  const evidenceIds = list.map((e) => e.id);
  const links = evidenceIds.length
    ? await db.select().from(hypothesisEvidence).where(inArray(hypothesisEvidence.evidenceId, evidenceIds))
    : [];
  const hypothesisIds = [...new Set(links.map((l) => l.hypothesisId))];
  const hypothesisList = hypothesisIds.length
    ? await db.select().from(hypotheses).where(inArray(hypotheses.id, hypothesisIds))
    : [];

  const filtered = list.filter((e) => (!type || e.type === type) && (!origin || e.originClass === origin));

  const personaName = (id: string | null) => personaList.find((p) => p.id === id)?.name;
  const hypothesesFor = (evidenceId: string) =>
    links.filter((l) => l.evidenceId === evidenceId).map((l) => hypothesisList.find((h) => h.id === l.hypothesisId)).filter(Boolean);

  const types = [...new Set(list.map((e) => e.type))];

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Research Repository"
        description="Todas as evidências do projeto em um só lugar — origem, persona, e a quais hipóteses cada uma está vinculada. Simulações de IA aparecem marcadas, nunca disfarçadas de dado real."
      />

      <Card className="mb-4">
        <div className="mb-2 flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-slate-700">Padrões entre hipóteses</p>
            <p className="mt-1 text-xs text-slate-500">
              Análise por IA que cruza as evidências reais de hipóteses diferentes procurando temas
              recorrentes — uma leitura interpretativa (inferência), nunca uma evidência nova por si só.
            </p>
          </div>
          {role !== "viewer" && (
            <form action={analyzePatterns}>
              <Button type="submit" size="sm" variant="secondary" disabled={realEvidenceCount < 2}>
                {latestAnalysis ? "Atualizar análise" : "Analisar padrões"}
              </Button>
            </form>
          )}
        </div>
        {realEvidenceCount < 2 ? (
          <p className="text-xs text-slate-400">
            É preciso ao menos 2 evidências reais no projeto para procurar padrões entre elas.
          </p>
        ) : !latestAnalysis ? (
          <p className="text-xs text-slate-400">Nenhuma análise rodada ainda.</p>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <OriginBadge originClass="inference" />
              <span>
                {new Date(latestAnalysis.createdAt).toLocaleString("pt-BR")} · baseado em{" "}
                {latestAnalysis.evidenceCountAnalyzed} evidência(s) real(is)
                {latestAnalysis.isMock && " · modo demo (sem GEMINI_API_KEY)"}
              </span>
            </div>
            {patterns.length === 0 ? (
              <p className="text-sm text-slate-400">Nenhum padrão cruzando hipóteses foi identificado nesta rodada.</p>
            ) : (
              <ul className="space-y-2">
                {patterns.map((p, i) => (
                  <li key={i} className="rounded-md border border-slate-100 p-2">
                    <p className="text-sm font-medium text-slate-800">{p.title}</p>
                    <p className="mt-0.5 text-xs text-slate-600">{p.description}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {p.relatedHypotheses.map((title, j) => (
                        <Badge key={j} color="indigo">
                          {title}
                        </Badge>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Card>

      <div className="mb-4 flex flex-wrap gap-2 text-xs">
        <Link href="/repository" className={!type && !origin ? "font-semibold text-indigo-600" : "text-slate-500"}>
          Todas ({list.length})
        </Link>
        {types.map((t) => (
          <Link key={t} href={`/repository?type=${t}`} className={type === t ? "font-semibold text-indigo-600" : "text-slate-500"}>
            {t} ({list.filter((e) => e.type === t).length})
          </Link>
        ))}
        <span className="text-slate-300">|</span>
        <Link href="/repository?origin=real_data" className={origin === "real_data" ? "font-semibold text-indigo-600" : "text-slate-500"}>
          Dado real
        </Link>
        <Link href="/repository?origin=simulation" className={origin === "simulation" ? "font-semibold text-indigo-600" : "text-slate-500"}>
          Simulação
        </Link>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="Nenhuma evidência encontrada"
          description="Evidências aparecem aqui automaticamente ao serem adicionadas a uma hipótese, ou capturadas via entrevistas, surveys e testes de usabilidade."
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((e) => (
            <Card key={e.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">{e.source}</p>
                  <p className="mt-1 text-xs text-slate-500">{e.content}</p>
                </div>
                <OriginBadge originClass={e.originClass} />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <Badge color="slate">{e.type}</Badge>
                {personaName(e.personaId) && <Badge color="indigo">{personaName(e.personaId)}</Badge>}
                {e.sampleSize && <span className="text-slate-400">n={e.sampleSize}</span>}
                {hypothesesFor(e.id).map((h) => (
                  <Link key={h!.id} href={`/hypotheses/${h!.id}`} className="text-indigo-600">
                    → {h!.title}
                  </Link>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
