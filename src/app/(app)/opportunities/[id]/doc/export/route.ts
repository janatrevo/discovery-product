import { NextResponse } from "next/server";
import { db } from "@/db";
import { opportunities, productDocs, userStories, hypotheses } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { getPageContext } from "@/lib/page-context";

const PRIORITY_LABELS: Record<string, string> = {
  must: "Deve ter",
  should: "Deveria ter",
  could: "Poderia ter",
};

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { project } = await getPageContext();

  const [opp] = await db.select().from(opportunities).where(eq(opportunities.id, id)).limit(1);
  if (!opp || opp.projectId !== project.id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const [doc, stories, hypothesis] = await Promise.all([
    db.select().from(productDocs).where(eq(productDocs.opportunityId, id)).limit(1).then((r) => r[0]),
    db.select().from(userStories).where(eq(userStories.opportunityId, id)).orderBy(asc(userStories.orderIndex)),
    opp.hypothesisId ? db.select().from(hypotheses).where(eq(hypotheses.id, opp.hypothesisId)).limit(1).then((r) => r[0]) : null,
  ]);

  const lines: string[] = [];
  lines.push(`# PRD — ${opp.title}`, "", `Gerado em: ${new Date().toLocaleString("pt-BR")}`);
  if (hypothesis) lines.push(`Hipótese de origem: ${hypothesis.title} (confiança: ${hypothesis.confidenceScore ?? 0})`);
  if (doc) {
    lines.push(
      `Origem do documento: ${
        doc.generatedBy === "ai_generated"
          ? "gerado por IA, ainda não revisado por um humano"
          : doc.generatedBy === "ai_assisted"
            ? "gerado por IA e editado por um humano"
            : "escrito manualmente"
      }${doc.reviewedAt ? ` · revisado em ${new Date(doc.reviewedAt).toLocaleDateString("pt-BR")}` : ""}`
    );
  }
  lines.push("");

  lines.push("## Problema", "", opp.problemRef || opp.description || "Não descrito.", "");

  lines.push("## Objetivos", "");
  const goals = (doc?.goals as string[]) ?? [];
  if (goals.length) goals.forEach((g) => lines.push(`- ${g}`));
  else lines.push("_Nenhum definido ainda._");
  lines.push("");

  lines.push("## Fora de escopo", "");
  const nonGoals = (doc?.nonGoals as string[]) ?? [];
  if (nonGoals.length) nonGoals.forEach((g) => lines.push(`- ${g}`));
  else lines.push("_Nenhum definido ainda._");
  lines.push("");

  lines.push("## User Stories", "");
  if (stories.length === 0) {
    lines.push("_Nenhuma story ainda._");
  } else {
    for (const s of stories) {
      lines.push(
        `### ${PRIORITY_LABELS[s.priority] ?? s.priority} — Como ${s.asA || "usuário"}, eu quero ${s.iWant}${
          s.soThat ? ` para que ${s.soThat}` : ""
        }`
      );
      if (s.aiGenerated && !s.confirmed) lines.push("_Sugestão de IA — ainda não confirmada por um humano._");
      const criteria = (s.acceptanceCriteria as string[]) ?? [];
      if (criteria.length) {
        lines.push("Critérios de aceite:");
        criteria.forEach((c) => lines.push(`- [ ] ${c}`));
      }
      lines.push("");
    }
  }

  lines.push("## Perguntas em aberto", "");
  const openQuestions = (doc?.openQuestions as string[]) ?? [];
  if (openQuestions.length) openQuestions.forEach((q) => lines.push(`- ${q}`));
  else lines.push("_Nenhuma._");

  const markdown = lines.join("\n");
  const filename = `prd_${opp.title.replace(/[^a-z0-9-_]+/gi, "_").toLowerCase()}.md`;

  return new NextResponse(markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
