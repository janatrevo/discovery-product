import Link from "next/link";
import { getPageContext } from "@/lib/page-context";
import { db } from "@/db";
import { hypotheses } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { Badge, Button, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { STATUS_LABELS, STATUS_COLORS, HYPOTHESIS_TYPES } from "@/lib/hypothesis-types";
import { computeStalenessFromReceipt } from "@/lib/staleness";
import type { ConfidenceReceipt } from "@/lib/confidence";

const COLUMNS = ["not_tested", "investigating", "partially_validated", "validated", "invalidated", "inconclusive"];

export default async function HypothesesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status: highlightStatus } = await searchParams;
  const { project } = await getPageContext();
  const list = await db
    .select()
    .from(hypotheses)
    .where(eq(hypotheses.projectId, project.id))
    .orderBy(desc(hypotheses.updatedAt));

  const typeLabel = (t: string) => HYPOTHESIS_TYPES.find((h) => h.value === t)?.label ?? t;

  return (
    <div>
      <PageHeader
        title="Hypotheses"
        description="Toda investigação começa e termina aqui — a hipótese é a unidade central da plataforma."
        actions={
          <Link href="/hypotheses/new">
            <Button>+ Nova hipótese</Button>
          </Link>
        }
      />

      {list.length === 0 ? (
        <EmptyState
          title="Nenhuma hipótese ainda"
          description="Escreva a primeira crença que o time quer investigar sobre um problema, persona ou solução."
          action={
            <Link href="/hypotheses/new">
              <Button>Criar primeira hipótese</Button>
            </Link>
          }
        />
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {COLUMNS.map((status) => {
            const items = list.filter((h) => h.status === status);
            return (
              <div
                key={status}
                className={`w-72 shrink-0 rounded-xl p-2 ${
                  highlightStatus === status ? "bg-indigo-50 ring-1 ring-indigo-300" : "bg-slate-100/60"
                }`}
              >
                <div className="mb-2 flex items-center justify-between px-1">
                  <Badge color={STATUS_COLORS[status]}>{STATUS_LABELS[status]}</Badge>
                  <span className="text-xs text-slate-400">{items.length}</span>
                </div>
                <div className="space-y-2">
                  {items.map((h) => {
                    const staleness = computeStalenessFromReceipt(h.confidenceReceipt as ConfidenceReceipt | null);
                    return (
                      <Link key={h.id} href={`/hypotheses/${h.id}`}>
                        <Card className="hover:shadow-md">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-medium text-slate-900">{h.title}</p>
                            {staleness.isStale && (
                              <span title={`Evidência mais recente tem ${staleness.daysSinceLatest} dias`}>
                                <Badge color="amber">⏱ revalidar</Badge>
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-slate-400">{typeLabel(h.type)}</p>
                          <p className="mt-2 text-xs font-medium text-slate-500">
                            Confiança: {h.confidenceScore ?? 0}
                          </p>
                        </Card>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
