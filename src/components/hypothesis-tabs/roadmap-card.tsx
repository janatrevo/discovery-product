import { db } from "@/db";
import { opportunities } from "@/db/schema";
import { eq } from "drizzle-orm";
import { Card } from "@/components/ui/primitives";
import { RoadmapView } from "./roadmap-view";

// Cartão da aba Overview da hipótese: todas as oportunidades vinculadas,
// agrupadas por módulo (tag "Módulo N") ou fase e em ordem alfabética.
export async function RoadmapCard({
  hypothesisId,
  unlinkAction,
}: {
  hypothesisId: string;
  // Só para Owner/Editor: habilita o modo "Gerenciar vínculos" (desvincular uma oportunidade).
  unlinkAction?: (opportunityId: string, hypothesisId: string) => Promise<void>;
}) {
  const rows = await db
    .select({
      id: opportunities.id,
      title: opportunities.title,
      status: opportunities.status,
      priorityScore: opportunities.priorityScore,
      tags: opportunities.tags,
    })
    .from(opportunities)
    .where(eq(opportunities.hypothesisId, hypothesisId));

  if (rows.length === 0) return null;

  const items = rows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status as string,
    score: r.priorityScore === null ? null : Number(r.priorityScore),
    tags: r.tags ?? [],
  }));

  return (
    <Card className="scroll-mt-4">
      <RoadmapView items={items} hypothesisId={hypothesisId} unlinkAction={unlinkAction} />
    </Card>
  );
}
