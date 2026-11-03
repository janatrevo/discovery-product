import { db } from "@/db";
import { opportunities } from "@/db/schema";
import { eq } from "drizzle-orm";
import { Card } from "@/components/ui/primitives";
import { RoadmapView } from "./roadmap-view";

// Cartão da aba Overview da hipótese: todas as oportunidades vinculadas,
// agrupadas por fase ("[Fase N]" no título) e em ordem alfabética.
export async function RoadmapCard({ hypothesisId }: { hypothesisId: string }) {
  const rows = await db
    .select({
      id: opportunities.id,
      title: opportunities.title,
      status: opportunities.status,
      priorityScore: opportunities.priorityScore,
    })
    .from(opportunities)
    .where(eq(opportunities.hypothesisId, hypothesisId));

  if (rows.length === 0) return null;

  const items = rows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status as string,
    score: r.priorityScore === null ? null : Number(r.priorityScore),
  }));

  return (
    <Card>
      <RoadmapView items={items} />
    </Card>
  );
}
