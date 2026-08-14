import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/db";
import { reports } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getPageContext } from "@/lib/page-context";
import { Badge, Button, Card, PageHeader } from "@/components/ui/primitives";
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

export default async function ReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { project } = await getPageContext();
  const [report] = await db.select().from(reports).where(eq(reports.id, id)).limit(1);
  if (!report || report.projectId !== project.id) notFound();

  const content = report.content as ReportContent;

  return (
    <div className="max-w-3xl space-y-4">
      <PageHeader
        title={report.title}
        description={`Gerado em ${new Date(content.generatedAt).toLocaleString("pt-BR")}`}
        actions={
          <Link href={`/reports/${report.id}/export`}>
            <Button variant="secondary">Exportar (.md)</Button>
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card>
          <p className="text-2xl font-semibold text-slate-900">{content.summary.totalHypotheses}</p>
          <p className="text-xs text-slate-500">Hipóteses</p>
        </Card>
        <Card>
          <p className="text-2xl font-semibold text-slate-900">{content.summary.totalOpportunities}</p>
          <p className="text-xs text-slate-500">Oportunidades</p>
        </Card>
        <Card>
          <p className="text-2xl font-semibold text-slate-900">{content.summary.totalDecisions}</p>
          <p className="text-xs text-slate-500">Decisões</p>
        </Card>
        <Card className={content.summary.simulationOnlyEvidencePct > 40 ? "border-amber-300 bg-amber-50" : ""}>
          <p className="text-2xl font-semibold text-slate-900">{content.summary.simulationOnlyEvidencePct}%</p>
          <p className="text-xs text-slate-500">Evidência só simulação</p>
        </Card>
      </div>

      <Card>
        <p className="mb-2 text-sm font-semibold text-slate-700">Hipóteses por status</p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(content.summary.byStatus).map(([status, count]) => (
            <Badge key={status} color="slate">
              {STATUS_LABELS[status] ?? status}: {count}
            </Badge>
          ))}
        </div>
      </Card>

      <Card>
        <p className="mb-2 text-sm font-semibold text-slate-700">Oportunidades priorizadas</p>
        <ul className="space-y-1 text-sm text-slate-700">
          {content.opportunities.slice(0, 15).map((o, i) => (
            <li key={i} className="flex items-center justify-between">
              <span>{o.title}</span>
              <span className="text-xs text-slate-400">score {o.priorityScore ?? "—"}</span>
            </li>
          ))}
          {content.opportunities.length === 0 && <li className="text-slate-400">Nenhuma oportunidade mapeada.</li>}
        </ul>
      </Card>

      <Card>
        <p className="mb-2 text-sm font-semibold text-slate-700">Decisões</p>
        <ul className="space-y-2 text-sm text-slate-700">
          {content.decisions.map((d, i) => (
            <li key={i}>
              <div className="flex items-center justify-between gap-2">
                <span>{d.decisionText}</span>
                {d.overriddenMethodology && <Badge color="amber">metodologia sobreposta</Badge>}
              </div>
              <span className="text-xs text-slate-400">{new Date(d.decidedAt).toLocaleDateString("pt-BR")}</span>
            </li>
          ))}
          {content.decisions.length === 0 && <li className="text-slate-400">Nenhuma decisão registrada.</li>}
        </ul>
      </Card>
    </div>
  );
}
