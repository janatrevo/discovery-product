"use server";

import { db } from "@/db";
import { reports, hypotheses, opportunities, decisions, evidence } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getPageContext } from "@/lib/page-context";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

// Relatório = snapshot ponto-no-tempo do estado do discovery. Não é gerado
// por IA — é uma consulta determinística ao banco, formatada. Isso evita
// que o relatório "invente" uma narrativa que não está nos dados.
export async function generateReport(formData: FormData) {
  const { user, project, role } = await getPageContext();
  if (role === "viewer") throw new Error("Viewers não podem gerar relatórios.");

  const title = String(formData.get("title") || `Relatório de discovery — ${new Date().toISOString().slice(0, 10)}`);

  const [hypothesisList, opportunityList, decisionList, evidenceList] = await Promise.all([
    db.select().from(hypotheses).where(eq(hypotheses.projectId, project.id)),
    db.select().from(opportunities).where(eq(opportunities.projectId, project.id)),
    db.select().from(decisions).where(eq(decisions.projectId, project.id)),
    db.select().from(evidence).where(eq(evidence.projectId, project.id)),
  ]);

  const byStatus: Record<string, number> = {};
  for (const h of hypothesisList) byStatus[h.status] = (byStatus[h.status] ?? 0) + 1;

  const simulationEvidence = evidenceList.filter((e) => e.originClass === "simulation").length;
  const simPct = evidenceList.length > 0 ? Math.round((simulationEvidence / evidenceList.length) * 100) : 0;

  const content = {
    generatedAt: new Date().toISOString(),
    projectName: project.name,
    summary: {
      totalHypotheses: hypothesisList.length,
      byStatus,
      totalEvidence: evidenceList.length,
      simulationOnlyEvidencePct: simPct,
      totalOpportunities: opportunityList.length,
      totalDecisions: decisionList.length,
    },
    hypotheses: hypothesisList.map((h) => ({
      title: h.title,
      type: h.type,
      status: h.status,
      confidenceScore: h.confidenceScore,
      statusOverridden: h.statusOverridden,
    })),
    opportunities: opportunityList
      .slice()
      .sort((a, b) => Number(b.priorityScore ?? 0) - Number(a.priorityScore ?? 0))
      .map((o) => ({ title: o.title, status: o.status, priorityScore: o.priorityScore, evidenceConfidence: o.evidenceConfidence })),
    decisions: decisionList.map((d) => ({
      decisionText: d.decisionText,
      rationale: d.rationale,
      decidedAt: d.decidedAt,
      overriddenMethodology: d.overriddenMethodology,
    })),
  };

  const [created] = await db
    .insert(reports)
    .values({
      projectId: project.id,
      title,
      scope: { type: "full_project" },
      content,
      createdBy: user.id,
    })
    .returning();

  revalidatePath("/reports");
  redirect(`/reports/${created.id}`);
}
