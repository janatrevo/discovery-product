import Link from "next/link";
import { db } from "@/db";
import { hypothesisAiAnalyses } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { Badge, Card } from "@/components/ui/primitives";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { AnalyzeHypothesisButton } from "@/components/analyze-hypothesis-button";
import { promoteSurveyToEvidence } from "@/app/(app)/research/surveys/actions";
import type { HypothesisAnalysis, SourceVerdict } from "@/lib/ai";
import type { AnalysisSourceMeta } from "@/lib/hypothesis-analysis-input";

const VERDICT_LABEL: Record<SourceVerdict, string> = {
  favoravel: "Parece favorável",
  contraria: "Parece contrária",
  mista: "Sinais mistos",
  insuficiente: "Dados insuficientes",
  irrelevante: "Sem relação clara",
};
const VERDICT_COLOR: Record<SourceVerdict, "emerald" | "red" | "amber" | "slate"> = {
  favoravel: "emerald",
  contraria: "red",
  mista: "amber",
  insuficiente: "slate",
  irrelevante: "slate",
};
const CONFIDENCE_LABEL = { baixa: "baixa", media: "média", alta: "alta" } as const;

function Findings({ title, items, tone }: { title: string; items: HypothesisAnalysis["supporting"]; tone: "good" | "bad" }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-3">
      <p className={`text-xs font-semibold uppercase ${tone === "good" ? "text-emerald-700" : "text-red-700"}`}>{title}</p>
      <ul className="mt-1 space-y-2">
        {items.map((f, i) => (
          <li key={i} className="text-sm text-slate-700">
            {f.finding}
            {f.source && <span className="ml-1 text-xs text-slate-400">— {f.source}</span>}
            {f.quote && <p className="mt-0.5 border-l-2 border-slate-200 pl-2 text-xs italic text-slate-500">&ldquo;{f.quote}&rdquo;</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

// Card "Análise por IA" da aba Research da hipótese: mostra a última análise
// (se houver) e o botão para gerar outra. É só uma sugestão — não é evidência
// e não muda a confiança; a pessoa decide registrando a evidência.
export async function HypothesisAiAnalysisCard({
  hypothesisId,
  canEdit,
}: {
  hypothesisId: string;
  canEdit: boolean;
}) {
  const [latest] = await db
    .select()
    .from(hypothesisAiAnalyses)
    .where(eq(hypothesisAiAnalyses.hypothesisId, hypothesisId))
    .orderBy(desc(hypothesisAiAnalyses.createdAt))
    .limit(1);

  const result = latest?.result as HypothesisAnalysis | undefined;
  const sources = (latest?.sources ?? []) as AnalysisSourceMeta[];
  const hrefOf = (id: string) => sources.find((s) => s.id === id)?.href;

  return (
    <Card className="mb-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-700">Análise por IA das pesquisas</p>
          <p className="mt-0.5 max-w-xl text-xs text-slate-500">
            A IA lê as respostas dos surveys e as transcrições das entrevistas vinculadas e sugere se o conjunto parece
            favorável ou contrário a esta hipótese. É só uma sugestão: não vira evidência nem muda a confiança até você
            registrar a evidência.
          </p>
        </div>
        {canEdit && <AnalyzeHypothesisButton hypothesisId={hypothesisId} hasPrevious={Boolean(latest)} />}
      </div>

      {latest && result && (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge color={VERDICT_COLOR[result.verdict]}>{VERDICT_LABEL[result.verdict]}</Badge>
            <span className="text-xs text-slate-500">
              confiança da IA nesse veredito: {CONFIDENCE_LABEL[result.verdictConfidence] ?? "baixa"}
            </span>
            <span className="text-xs text-slate-400">
              · {new Date(latest.createdAt).toLocaleString("pt-BR")} · {latest.modelVersion}
            </span>
          </div>

          <p className="mt-3 text-sm text-slate-700">{result.summary}</p>

          {(result.quantitative || result.qualitative) && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {result.quantitative && (
                <div className="rounded-md bg-slate-50 p-3">
                  <p className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase text-slate-500">
                    Quantitativa (surveys)
                    <Badge color={VERDICT_COLOR[result.quantitative.verdict]}>{VERDICT_LABEL[result.quantitative.verdict]}</Badge>
                  </p>
                  <p className="text-sm text-slate-700">{result.quantitative.summary}</p>
                </div>
              )}
              {result.qualitative && (
                <div className="rounded-md bg-slate-50 p-3">
                  <p className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase text-slate-500">
                    Qualitativa (entrevistas)
                    <Badge color={VERDICT_COLOR[result.qualitative.verdict]}>{VERDICT_LABEL[result.qualitative.verdict]}</Badge>
                  </p>
                  <p className="text-sm text-slate-700">{result.qualitative.summary}</p>
                </div>
              )}
            </div>
          )}

          <Findings title="O que apoia a hipótese" items={result.supporting} tone="good" />
          <Findings title="O que contradiz a hipótese" items={result.contradicting} tone="bad" />

          {result.perSource.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase text-slate-500">Pesquisa por pesquisa</p>
              <ul className="mt-1 space-y-2">
                {result.perSource.map((s) => {
                  const href = hrefOf(s.id);
                  const suggestFavorable = s.verdict === "favoravel";
                  const suggestContrary = s.verdict === "contraria";
                  return (
                    <li key={s.id} className="rounded-md border border-slate-200 px-3 py-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <Badge color={VERDICT_COLOR[s.verdict]}>{VERDICT_LABEL[s.verdict]}</Badge>
                          {href ? (
                            <Link href={href} className="truncate text-sm font-medium text-indigo-700 hover:underline">
                              {s.label}
                            </Link>
                          ) : (
                            <span className="truncate text-sm font-medium text-slate-800">{s.label}</span>
                          )}
                          <span className="text-xs text-slate-400">{s.kind === "survey" ? "survey" : "entrevista"}</span>
                        </div>
                        {canEdit && s.kind === "survey" && (suggestFavorable || suggestContrary) && (
                          <form action={promoteSurveyToEvidence.bind(null, s.id)}>
                            <input type="hidden" name="hypothesisId" value={hypothesisId} />
                            <input type="hidden" name="favorable" value={suggestFavorable ? "true" : "false"} />
                            <ConfirmSubmitButton
                              variant="secondary"
                              size="sm"
                              message={`Registrar este survey como evidência ${suggestFavorable ? "FAVORÁVEL" : "CONTRÁRIA"} a esta hipótese? Isso passa a contar no cálculo de confiança.`}
                            >
                              Confirmar como evidência {suggestFavorable ? "favorável" : "contrária"}
                            </ConfirmSubmitButton>
                          </form>
                        )}
                        {canEdit && s.kind === "interview" && href && (suggestFavorable || suggestContrary) && (
                          <Link href={href} className="text-xs font-medium text-indigo-600 hover:underline">
                            Abrir para registrar como evidência
                          </Link>
                        )}
                      </div>
                      {s.reason && <p className="mt-1 text-xs text-slate-600">{s.reason}</p>}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {result.gaps.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase text-slate-500">O que ainda falta descobrir</p>
              <ul className="mt-1 list-inside list-disc space-y-0.5 text-sm text-slate-700">
                {result.gaps.map((g, i) => (
                  <li key={i}>{g}</li>
                ))}
              </ul>
            </div>
          )}

          {result.caveats.length > 0 && (
            <div className="mt-4 rounded-md bg-amber-50 p-3">
              <p className="text-xs font-semibold uppercase text-amber-800">Cuidados ao interpretar</p>
              <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs text-amber-900">
                {result.caveats.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
