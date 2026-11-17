import Link from "next/link";
import { experimentMethodLabel } from "@/lib/experiment-methods";
import { db } from "@/db";
import { experiments } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { Badge, Button, Card, EmptyState } from "@/components/ui/primitives";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { deleteExperiment } from "@/app/(app)/experiments/actions";

export async function ExperimentsMiniList({
  hypothesisId,
  canManage = false,
}: {
  hypothesisId: string;
  projectId: string;
  canManage?: boolean;
}) {
  const list = await db
    .select()
    .from(experiments)
    .where(eq(experiments.hypothesisId, hypothesisId))
    .orderBy(desc(experiments.createdAt));

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Link href={`/experiments/new?hypothesisId=${hypothesisId}`}>
          <Button>+ Novo experimento</Button>
        </Link>
      </div>
      {list.length === 0 ? (
        <EmptyState title="Nenhum experimento vinculado" description="Formalize um método de validação com critério de sucesso definido antes do resultado." />
      ) : (
        list.map((e) => (
          <Card key={e.id} className="hover:shadow-md">
            <div className="flex items-start justify-between gap-3">
              <Link href={`/experiments/${e.id}`} className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-slate-800">{experimentMethodLabel(e.method)}</p>
                  <Badge>{e.status}</Badge>
                </div>
                <p className="mt-1 text-xs text-slate-500">{e.objective}</p>
              </Link>
              {canManage && (
                <form action={deleteExperiment.bind(null, e.id, `/hypotheses/${hypothesisId}?tab=experiments`)}>
                  <ConfirmSubmitButton
                    variant="ghost"
                    size="sm"
                    message="Excluir este experimento? Experimentos exigem uma hipótese, então não dá para só desvincular. Essa ação não pode ser desfeita."
                  >
                    excluir
                  </ConfirmSubmitButton>
                </form>
              )}
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
