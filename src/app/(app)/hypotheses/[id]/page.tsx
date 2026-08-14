import Link from "next/link";
import { notFound } from "next/navigation";
import clsx from "clsx";
import { db } from "@/db";
import {
  hypotheses,
  hypothesisPersonas,
  hypothesisProducts,
  hypothesisHistory,
  personas,
  products,
} from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { getPageContext } from "@/lib/page-context";
import { Badge, Button, Card, PageHeader } from "@/components/ui/primitives";
import { STATUS_LABELS, STATUS_COLORS, HYPOTHESIS_TYPES } from "@/lib/hypothesis-types";
import { deleteHypothesis, overrideStatus, clearOverride } from "../actions";
import { EvidenceTab } from "@/components/hypothesis-tabs/evidence-tab";
import { ConfidenceReceiptCard } from "@/components/hypothesis-tabs/confidence-receipt";
import { ExperimentsMiniList } from "@/components/hypothesis-tabs/experiments-mini";
import { SimulationsMiniList } from "@/components/hypothesis-tabs/simulations-mini";
import { ResearchMiniList } from "@/components/hypothesis-tabs/research-mini";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "evidence", label: "Evidence" },
  { key: "research", label: "Research" },
  { key: "experiments", label: "Experiments" },
  { key: "simulations", label: "Simulations" },
  { key: "history", label: "History" },
];

export default async function HypothesisWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab = "overview" } = await searchParams;
  const { project, role } = await getPageContext();

  const [hyp] = await db.select().from(hypotheses).where(eq(hypotheses.id, id)).limit(1);
  if (!hyp || hyp.projectId !== project.id) notFound();

  const [linkedPersonas, linkedProducts] = await Promise.all([
    db
      .select({ persona: personas })
      .from(hypothesisPersonas)
      .innerJoin(personas, eq(personas.id, hypothesisPersonas.personaId))
      .where(eq(hypothesisPersonas.hypothesisId, id)),
    db
      .select({ product: products })
      .from(hypothesisProducts)
      .innerJoin(products, eq(products.id, hypothesisProducts.productId))
      .where(eq(hypothesisProducts.hypothesisId, id)),
  ]);

  const typeInfo = HYPOTHESIS_TYPES.find((t) => t.value === hyp.type);

  return (
    <div className="max-w-4xl">
      <PageHeader
        title={hyp.title}
        description={typeInfo ? `${typeInfo.label} — ${typeInfo.hint}` : hyp.type}
        actions={
          <>
            <Badge color={STATUS_COLORS[hyp.status]}>{STATUS_LABELS[hyp.status]}</Badge>
            <Link href={`/opportunities/new?hypothesisId=${id}`}>
              <Button variant="secondary">+ Oportunidade</Button>
            </Link>
            <Link href={`/hypotheses/${id}/edit`}>
              <Button variant="secondary">Editar</Button>
            </Link>
            {(role === "owner" || role === "editor") && (
              <form action={deleteHypothesis.bind(null, id)}>
                <Button variant="danger" type="submit">
                  Excluir
                </Button>
              </form>
            )}
          </>
        }
      />

      <div className="mb-5 flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/hypotheses/${id}?tab=${t.key}`}
            className={clsx(
              "px-3 py-2 text-sm font-medium",
              tab === t.key
                ? "border-b-2 border-indigo-600 text-indigo-700"
                : "text-slate-500 hover:text-slate-700"
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "overview" && (
        <div className="space-y-4">
          {hyp.description && (
            <Card>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Descrição</p>
              <p className="mt-1 text-sm text-slate-700">{hyp.description}</p>
            </Card>
          )}

          <ConfidenceReceiptCard hypothesis={hyp} />

          <Card>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Personas & Produtos</p>
            <div className="flex flex-wrap gap-2">
              {linkedPersonas.map((p) => (
                <Link key={p.persona.id} href={`/personas/${p.persona.id}`}>
                  <Badge color={p.persona.origin === "research_based" ? "emerald" : "amber"}>{p.persona.name}</Badge>
                </Link>
              ))}
              {linkedProducts.map((p) => (
                <Link key={p.product.id} href={`/products/${p.product.id}`}>
                  <Badge color="indigo">{p.product.name}</Badge>
                </Link>
              ))}
              {linkedPersonas.length === 0 && linkedProducts.length === 0 && (
                <span className="text-sm text-slate-400">Nenhuma persona ou produto vinculado.</span>
              )}
            </div>
          </Card>

          {(role === "owner" || role === "editor") && (
            <Card>
              <p className="mb-2 text-sm font-semibold text-slate-700">Forçar transição de status (override manual)</p>
              <p className="mb-3 text-xs text-slate-500">
                Use apenas quando uma decisão de negócio precisa ignorar a metodologia. Isso fica
                marcado e visível no relatório e no histórico.
              </p>
              <form action={overrideStatus.bind(null, id)} className="flex flex-wrap items-end gap-2">
                <select name="status" defaultValue={hyp.status} className="rounded-md border border-slate-300 px-2 py-2 text-sm">
                  {Object.entries(STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <input
                  name="reason"
                  required
                  placeholder="Justificativa (obrigatória)"
                  className="min-w-[220px] flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
                <Button type="submit" variant="secondary">
                  Forçar
                </Button>
              </form>
              {hyp.statusOverridden && (
                <div className="mt-3 rounded-md bg-amber-50 p-3 text-xs text-amber-800">
                  <strong>Status atual é override manual:</strong> {hyp.statusOverrideReason}
                  <form action={clearOverride.bind(null, id)} className="mt-2">
                    <Button type="submit" size="sm" variant="ghost">
                      Voltar a calcular automaticamente
                    </Button>
                  </form>
                </div>
              )}
            </Card>
          )}
        </div>
      )}

      {tab === "evidence" && <EvidenceTab hypothesisId={id} projectId={project.id} role={role} />}

      {tab === "research" && <ResearchMiniList hypothesisId={id} projectId={project.id} />}

      {tab === "experiments" && <ExperimentsMiniList hypothesisId={id} projectId={project.id} />}

      {tab === "simulations" && <SimulationsMiniList hypothesisId={id} projectId={project.id} />}

      {tab === "history" && <HistoryTab hypothesisId={id} />}
    </div>
  );
}

async function HistoryTab({ hypothesisId }: { hypothesisId: string }) {
  const history = await db
    .select()
    .from(hypothesisHistory)
    .where(eq(hypothesisHistory.hypothesisId, hypothesisId))
    .orderBy(desc(hypothesisHistory.changedAt));

  return (
    <Card>
      <p className="mb-3 text-sm font-semibold text-slate-700">
        Histórico (append-only — nunca editado, só acrescentado)
      </p>
      {history.length === 0 ? (
        <p className="text-sm text-slate-400">Nenhum evento registrado ainda.</p>
      ) : (
        <ul className="space-y-2">
          {history.map((h) => (
            <li key={h.id} className="border-b border-slate-100 pb-2 text-sm last:border-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-slate-700">{h.fieldChanged}</span>
                {h.isOverride && <Badge color="amber">override manual</Badge>}
                <span className="text-xs text-slate-400">
                  {new Date(h.changedAt).toLocaleString("pt-BR")}
                </span>
              </div>
              {(h.oldValue || h.newValue) && (
                <p className="mt-0.5 text-xs text-slate-500">
                  {h.oldValue && <span className="line-through">{h.oldValue}</span>} → {h.newValue}
                </p>
              )}
              {h.note && <p className="mt-0.5 text-xs text-slate-500">{h.note}</p>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
