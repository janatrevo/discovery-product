import Link from "next/link";
import { getPageContext } from "@/lib/page-context";
import { db } from "@/db";
import { hypotheses, hypothesisProducts, products } from "@/db/schema";
import { eq, asc, desc } from "drizzle-orm";
import { Button, EmptyState, PageHeader } from "@/components/ui/primitives";
import { STATUS_LABELS, STATUS_COLORS, HYPOTHESIS_TYPES } from "@/lib/hypothesis-types";
import { computeStalenessFromReceipt } from "@/lib/staleness";
import type { ConfidenceReceipt } from "@/lib/confidence";
import { HypothesisBoard, type HypothesisCardData } from "@/components/hypothesis-priority-column";

const COLUMNS = ["not_tested", "investigating", "partially_validated", "validated", "invalidated", "inconclusive"];

export default async function HypothesesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status: highlightStatus } = await searchParams;
  const { project } = await getPageContext();
  const [list, productLinks] = await Promise.all([
    db
      .select()
      .from(hypotheses)
      .where(eq(hypotheses.projectId, project.id))
      .orderBy(asc(hypotheses.priorityOrder), desc(hypotheses.updatedAt)),
    db
      .select({ hypothesisId: hypothesisProducts.hypothesisId, product: products })
      .from(hypothesisProducts)
      .innerJoin(products, eq(products.id, hypothesisProducts.productId))
      .innerJoin(hypotheses, eq(hypotheses.id, hypothesisProducts.hypothesisId))
      .where(eq(hypotheses.projectId, project.id)),
  ]);

  const productsByHypothesis = new Map<string, (typeof productLinks)[number]["product"][]>();
  for (const link of productLinks) {
    const arr = productsByHypothesis.get(link.hypothesisId) ?? [];
    arr.push(link.product);
    productsByHypothesis.set(link.hypothesisId, arr);
  }

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
        <HypothesisBoard
          columns={COLUMNS.map((status) => ({
            status,
            label: STATUS_LABELS[status],
            color: STATUS_COLORS[status],
            highlighted: highlightStatus === status,
          }))}
          itemsByStatus={Object.fromEntries(
            COLUMNS.map((status) => [
              status,
              list
                .filter((h) => h.status === status)
                .map((h): HypothesisCardData => {
                  const staleness = computeStalenessFromReceipt(h.confidenceReceipt as ConfidenceReceipt | null);
                  return {
                    id: h.id,
                    title: h.title,
                    typeLabel: typeLabel(h.type),
                    confidenceScore: Number(h.confidenceScore ?? 0),
                    isStale: staleness.isStale,
                    daysSinceLatest: staleness.daysSinceLatest ?? undefined,
                    products: (productsByHypothesis.get(h.id) ?? []).map((p) => ({ id: p.id, name: p.name })),
                  };
                }),
            ])
          )}
        />
      )}
    </div>
  );
}
