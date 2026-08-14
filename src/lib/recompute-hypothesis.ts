import { db } from "@/db";
import {
  hypotheses,
  hypothesisEvidence,
  hypothesisPersonas,
  evidence as evidenceTable,
  hypothesisHistory,
  projects,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { computeConfidence, EvidenceForScoring } from "./confidence";
import { evaluateStatus } from "./hypothesis-status";

// Chamado sempre que evidência é criada/editada/(des)vinculada a uma
// hipótese. Recalcula o Confidence Score e, se o status não estiver com
// override manual, aplica a transição sugerida automaticamente — sempre
// registrando no histórico append-only por que a mudança aconteceu.
export async function recomputeHypothesis(hypothesisId: string, changedBy?: string) {
  const [hyp] = await db.select().from(hypotheses).where(eq(hypotheses.id, hypothesisId)).limit(1);
  if (!hyp) return;

  const [project] = await db.select().from(projects).where(eq(projects.id, hyp.projectId)).limit(1);

  const personaLinks = await db
    .select()
    .from(hypothesisPersonas)
    .where(eq(hypothesisPersonas.hypothesisId, hypothesisId));
  const personaIds = new Set(personaLinks.map((p) => p.personaId));

  const links = await db
    .select({ ev: evidenceTable, favorable: hypothesisEvidence.favorable })
    .from(hypothesisEvidence)
    .innerJoin(evidenceTable, eq(evidenceTable.id, hypothesisEvidence.evidenceId))
    .where(eq(hypothesisEvidence.hypothesisId, hypothesisId));

  const scoringInput: EvidenceForScoring[] = links.map((l) => ({
    id: l.ev.id,
    favorable: l.favorable,
    originClass: l.ev.originClass,
    type: l.ev.type,
    sampleSize: l.ev.sampleSize,
    qualityScore: l.ev.qualityScore,
    reliabilityScore: l.ev.reliabilityScore,
    evidenceDate: new Date(l.ev.evidenceDate),
    personaMatchesHypothesis: l.ev.personaId ? personaIds.has(l.ev.personaId) : false,
  }));

  const receipt = computeConfidence(scoringInput, {
    minSampleSurvey: project?.minSampleSurvey ?? 30,
    minSampleInterview: project?.minSampleInterview ?? 5,
  });

  const realLinks = links.filter((l) => l.ev.originClass === "real_data");
  const favorableCount = realLinks.filter((l) => l.favorable).length;
  const contraryCount = realLinks.filter((l) => !l.favorable).length;

  const evaluation = evaluateStatus(receipt, favorableCount, contraryCount, project?.confidenceValidatedThreshold ?? 70);

  const updates: Record<string, unknown> = {
    confidenceScore: String(receipt.score),
    confidenceReceipt: receipt,
    updatedAt: new Date(),
  };

  if (!hyp.statusOverridden && evaluation.status !== hyp.status) {
    updates.status = evaluation.status;
    await db.insert(hypothesisHistory).values({
      hypothesisId,
      fieldChanged: "status",
      oldValue: hyp.status,
      newValue: evaluation.status,
      note: `Transição automática — critérios atendidos: ${evaluation.criteriaMet.join("; ") || "nenhum"}`,
      isOverride: false,
      changedBy: changedBy ?? hyp.ownerId,
    });
  }

  await db.update(hypotheses).set(updates).where(eq(hypotheses.id, hypothesisId));
  return { receipt, evaluation };
}
