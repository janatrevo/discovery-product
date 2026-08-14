import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { personas, evidence, personaVersions } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { getPageContext } from "@/lib/page-context";
import { Badge, Button, Card, PageHeader } from "@/components/ui/primitives";
import { OriginBadge } from "@/components/origin-badge";
import { deletePersona } from "../actions";

function Block({ title, items }: { title: string; items?: string[] | null }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{title}</p>
      <ul className="mt-1 list-inside list-disc space-y-0.5 text-sm text-slate-700">
        {items.map((i, idx) => (
          <li key={idx}>{i}</li>
        ))}
      </ul>
    </div>
  );
}

export default async function PersonaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { project, role } = await getPageContext();
  const [persona] = await db
    .select()
    .from(personas)
    .where(eq(personas.id, id))
    .limit(1);
  if (!persona || persona.projectId !== project.id) notFound();

  const linkedEvidence = await db.select().from(evidence).where(eq(evidence.personaId, id));
  const versions = await db
    .select()
    .from(personaVersions)
    .where(eq(personaVersions.personaId, id))
    .orderBy(desc(personaVersions.createdAt));

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={persona.name}
        description={persona.shortDescription ?? undefined}
        actions={
          <>
            <Link href={`/personas/${id}/edit`}>
              <Button variant="secondary">Editar</Button>
            </Link>
            {(role === "owner" || role === "editor") && (
              <form action={deletePersona.bind(null, id)}>
                <Button variant="danger" type="submit">
                  Excluir
                </Button>
              </form>
            )}
          </>
        }
      />

      <div className="mb-4 flex items-center gap-2">
        <Badge color={persona.origin === "research_based" ? "emerald" : "amber"}>
          {persona.origin === "research_based" ? "Research-based" : "Sintética — não validada por pesquisa"}
        </Badge>
        <span className="text-xs text-slate-400">{persona.completeness}% preenchido</span>
      </div>

      {persona.jtbdMain && (
        <Card className="mb-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">JTBD principal</p>
          <p className="mt-1 text-sm text-slate-700">{persona.jtbdMain}</p>
        </Card>
      )}

      <Card className="mb-4 space-y-3">
        <p className="text-sm font-semibold text-slate-700">Contexto</p>
        {[
          ["Profissional", persona.professionalContext],
          ["Pessoal", persona.personalContext],
          ["Uso", persona.usageContext],
          ["Compra", persona.purchaseContext],
          ["Familiaridade tecnológica", persona.techFamiliarity],
          ["Sensibilidade a preço", persona.priceSensitivity],
        ]
          .filter(([, v]) => v)
          .map(([label, value]) => (
            <div key={label as string}>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
              <p className="text-sm text-slate-700">{value}</p>
            </div>
          ))}
      </Card>

      <Card className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Block title="Objetivos" items={persona.goals as string[]} />
        <Block title="Dores" items={persona.pains as string[]} />
        <Block title="Frustrações" items={persona.frustrations as string[]} />
        <Block title="Necessidades" items={persona.needs as string[]} />
        <Block title="Motivações" items={persona.motivations as string[]} />
        <Block title="Comportamentos" items={persona.behaviors as string[]} />
        <Block title="Medos" items={persona.fears as string[]} />
        <Block title="Objeções" items={persona.objections as string[]} />
        <Block title="Critérios de decisão" items={persona.decisionCriteria as string[]} />
      </Card>

      {persona.origin === "research_based" && (
        <Card className="mb-4 space-y-3">
          <p className="text-sm font-semibold text-slate-700">Evidência de origem</p>
          <Block title="Citações reais" items={persona.realQuotes as string[]} />
          <Block title="Fontes" items={persona.sources as string[]} />
          {linkedEvidence.length > 0 && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Evidências vinculadas ({linkedEvidence.length})
              </p>
              <ul className="mt-1 space-y-1">
                {linkedEvidence.map((e) => (
                  <li key={e.id} className="flex items-center gap-2 text-sm text-slate-700">
                    <OriginBadge originClass={e.originClass} /> {e.source}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      {versions.length > 0 && (
        <Card>
          <p className="mb-2 text-sm font-semibold text-slate-700">Histórico de versões</p>
          <ul className="space-y-1 text-sm text-slate-600">
            {versions.map((v) => (
              <li key={v.id}>
                v{v.versionNo} — {v.changeNote} ({new Date(v.createdAt).toLocaleDateString("pt-BR")})
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
