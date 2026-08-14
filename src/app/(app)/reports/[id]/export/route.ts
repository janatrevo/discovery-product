import { NextResponse } from "next/server";
import { db } from "@/db";
import { reports } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getPageContext } from "@/lib/page-context";
import { STATUS_LABELS } from "@/lib/hypothesis-types";

type ReportContent = {
  generatedAt: string;
  projectName: string;
  summary: {
    totalHypotheses: number;
    byStatus: Record<string, number>;
    totalEvidence: number;
    simulationOnlyEvidencePct: number;
    totalOpportunities: number;
    totalDecisions: number;
  };
  hypotheses: { title: string; type: string; status: string; confidenceScore: string | null; statusOverridden: boolean }[];
  opportunities: { title: string; status: string; priorityScore: string | null; evidenceConfidence: number }[];
  decisions: { decisionText: string; rationale: string | null; decidedAt: string; overriddenMethodology: boolean }[];
};

function toMarkdown(title: string, c: ReportContent): string {
  const lines: string[] = [];
  lines.push(`# ${title}`, "", `Projeto: ${c.projectName}`, `Gerado em: ${new Date(c.generatedAt).toLocaleString("pt-BR")}`, "");
  lines.push("## Resumo", "");
  lines.push(`- Hipóteses totais: ${c.summary.totalHypotheses}`);
  lines.push(`- Evidências totais: ${c.summary.totalEvidence} (${c.summary.simulationOnlyEvidencePct}% apenas simulação de IA)`);
  lines.push(`- Oportunidades mapeadas: ${c.summary.totalOpportunities}`);
  lines.push(`- Decisões registradas: ${c.summary.totalDecisions}`, "");
  lines.push("### Hipóteses por status", "");
  for (const [status, count] of Object.entries(c.summary.byStatus)) {
    lines.push(`- ${STATUS_LABELS[status] ?? status}: ${count}`);
  }
  lines.push("", "## Hipóteses", "");
  for (const h of c.hypotheses) {
    lines.push(`- **${h.title}** — ${h.status} (confiança: ${h.confidenceScore ?? 0})${h.statusOverridden ? " [status forçado manualmente]" : ""}`);
  }
  lines.push("", "## Oportunidades priorizadas", "");
  for (const o of c.opportunities) {
    lines.push(`- **${o.title}** — score ${o.priorityScore ?? "—"} (evidência: ${o.evidenceConfidence}%) — ${o.status}`);
  }
  lines.push("", "## Decisões", "");
  for (const d of c.decisions) {
    lines.push(`- **${d.decisionText}** (${new Date(d.decidedAt).toLocaleDateString("pt-BR")})${d.overriddenMethodology ? " ⚠️ metodologia sobreposta" : ""}`);
    if (d.rationale) lines.push(`  - Racional: ${d.rationale}`);
  }
  return lines.join("\n");
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { project } = await getPageContext();
  const [report] = await db.select().from(reports).where(eq(reports.id, id)).limit(1);
  if (!report || report.projectId !== project.id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const markdown = toMarkdown(report.title, report.content as ReportContent);
  const filename = `${report.title.replace(/[^a-z0-9-_]+/gi, "_").toLowerCase()}.md`;

  return new NextResponse(markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
