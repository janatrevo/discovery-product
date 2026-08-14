import Link from "next/link";
import { db } from "@/db";
import { experiments } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { Badge, Button, Card, EmptyState } from "@/components/ui/primitives";

export async function ExperimentsMiniList({ hypothesisId }: { hypothesisId: string; projectId: string }) {
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
          <Link key={e.id} href={`/experiments/${e.id}`}>
            <Card className="hover:shadow-md">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-800">{e.method}</p>
                <Badge>{e.status}</Badge>
              </div>
              <p className="mt-1 text-xs text-slate-500">{e.objective}</p>
            </Card>
          </Link>
        ))
      )}
    </div>
  );
}
