import { notFound } from "next/navigation";
import { db } from "@/db";
import { usabilityTests, usabilityTestAssets, usabilityFindings, personas } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getPageContext } from "@/lib/page-context";
import { Badge, Button, Card, PageHeader, Select } from "@/components/ui/primitives";
import { OriginBadge, SimulationBanner } from "@/components/origin-badge";
import { updateFinding } from "../actions";

const SEVERITY_COLOR: Record<string, "slate" | "amber" | "red" | "sky"> = {
  low: "sky",
  medium: "amber",
  high: "red",
  critical: "red",
};

export default async function UsabilityTestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { project, role } = await getPageContext();
  const [test] = await db.select().from(usabilityTests).where(eq(usabilityTests.id, id)).limit(1);
  if (!test || test.projectId !== project.id) notFound();

  const [assets, findings] = await Promise.all([
    db.select().from(usabilityTestAssets).where(eq(usabilityTestAssets.usabilityTestId, id)),
    db
      .select({ finding: usabilityFindings, persona: personas })
      .from(usabilityFindings)
      .leftJoin(personas, eq(personas.id, usabilityFindings.personaId))
      .where(eq(usabilityFindings.usabilityTestId, id)),
  ]);

  const canEdit = role !== "viewer";

  return (
    <div className="max-w-4xl space-y-4">
      <PageHeader title={test.title} description={test.task ?? undefined} />
      <SimulationBanner mode="image" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          {assets[0] && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={assets[0].url} alt={assets[0].filename ?? "asset"} className="w-full rounded-md border border-slate-200" />
          )}
        </Card>
        <Card>
          <p className="mb-2 text-sm font-semibold text-slate-700">
            Registro estruturado de problemas — Tela → Problema → Persona → Severidade → Recomendação
          </p>
          <ul className="space-y-3">
            {findings.map(({ finding, persona }) => (
              <li key={finding.id} className="rounded-md border border-slate-100 p-2 text-sm">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <Badge color="indigo">{persona?.name ?? "—"}</Badge>
                  <div className="flex items-center gap-1">
                    <OriginBadge originClass={finding.originClass} />
                    {finding.humanConfirmed && <Badge color="emerald">confirmado por humano</Badge>}
                  </div>
                </div>
                <p className="text-slate-700">{finding.problem}</p>
                {finding.recommendation && finding.recommendation !== "—" && (
                  <p className="mt-1 text-xs text-slate-500">Recomendação: {finding.recommendation}</p>
                )}
                {canEdit && (
                  <form action={updateFinding.bind(null, finding.id)} className="mt-2 flex flex-wrap items-center gap-2">
                    <Select name="severity" defaultValue={finding.severity} className="w-32 py-1 text-xs">
                      <option value="low">low</option>
                      <option value="medium">medium</option>
                      <option value="high">high</option>
                      <option value="critical">critical</option>
                    </Select>
                    <label className="flex items-center gap-1 text-xs text-slate-500">
                      <input type="checkbox" name="humanConfirmed" value="true" defaultChecked={finding.humanConfirmed} />
                      confirmar como real
                    </label>
                    <Button type="submit" size="sm" variant="secondary">
                      Salvar
                    </Button>
                  </form>
                )}
                <Badge color={SEVERITY_COLOR[finding.severity]}>{finding.severity}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
