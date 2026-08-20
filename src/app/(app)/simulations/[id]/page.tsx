import { notFound } from "next/navigation";
import { db } from "@/db";
import { simulationRuns, simulationResponses, personas } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { getPageContext } from "@/lib/page-context";
import { Badge, Button, Card, PageHeader } from "@/components/ui/primitives";
import { SimulationBanner } from "@/components/origin-badge";
import { deleteSimulation } from "../actions";

type SimResponseData = {
  expectations?: string;
  understanding?: string;
  doubts?: string;
  trust_signals?: string;
  distrust_signals?: string;
  objections?: string[];
  frustrations?: string[];
  usage_intent?: string;
  purchase_intent?: string;
  barriers?: string[];
  relevant_features?: string[];
  unnecessary_features?: string[];
};

type PanelSynthesis = {
  consensus?: string[];
  divergence?: string[];
  segmentation_signal?: string;
};

const TEXT_ROWS: { key: keyof SimResponseData; label: string }[] = [
  { key: "expectations", label: "Expectativa" },
  { key: "understanding", label: "Entendimento" },
  { key: "doubts", label: "Dúvidas" },
  { key: "trust_signals", label: "Sinais de confiança" },
  { key: "distrust_signals", label: "Sinais de desconfiança" },
  { key: "usage_intent", label: "Intenção de uso" },
  { key: "purchase_intent", label: "Intenção de compra" },
];

const LIST_ROWS: { key: keyof SimResponseData; label: string }[] = [
  { key: "objections", label: "Objeções" },
  { key: "frustrations", label: "Frustrações" },
  { key: "barriers", label: "Barreiras" },
];

// Classes literais completas (Tailwind só gera CSS para strings que aparecem
// assim no código-fonte — concatenar "lg:grid-cols-" + n em runtime não funciona).
const PANEL_GRID_COLS: Record<number, string> = {
  1: "lg:grid-cols-1",
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
};

export default async function SimulationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { project, role } = await getPageContext();
  const [run] = await db.select().from(simulationRuns).where(eq(simulationRuns.id, id)).limit(1);
  if (!run || run.projectId !== project.id) notFound();
  const canDelete = role === "owner" || role === "editor";

  const responses = await db.select().from(simulationResponses).where(eq(simulationResponses.simulationRunId, id));
  const personaList = await db.select().from(personas).where(inArray(personas.id, run.personaIds));
  const isPanel = personaList.length > 1;
  const synthesis = (run.synthesisJson ?? null) as PanelSynthesis | null;

  const dataByPersona = new Map(
    personaList.map((persona) => {
      const resp = responses.find((r) => r.personaId === persona.id);
      return [persona.id, (resp?.responseJson ?? {}) as SimResponseData] as const;
    })
  );

  const gridClass = `grid grid-cols-1 gap-4 ${isPanel ? PANEL_GRID_COLS[Math.min(personaList.length, 3)] : ""}`;

  return (
    <div className="max-w-6xl space-y-4">
      <PageHeader
        title={isPanel ? "Painel multi-persona" : "Resultado da simulação"}
        description={run.scenario ?? undefined}
        actions={
          canDelete ? (
            <form action={deleteSimulation.bind(null, run.id, "/simulations")}>
              <Button type="submit" variant="danger" size="sm">
                Excluir simulação
              </Button>
            </form>
          ) : undefined
        }
      />
      <SimulationBanner mode="scenario" />
      {run.isMock && (
        <Card className="border-slate-300 bg-slate-50">
          <p className="text-xs text-slate-500">
            Modo demo: GEMINI_API_KEY não configurada nesta instância (ou pelo menos uma persona
            caiu em modo demo) — parte das respostas abaixo são ilustrativas, não geradas por um
            modelo de linguagem real. Configure a chave para simulação real.
          </p>
        </Card>
      )}
      <Card>
        <p className="text-sm text-slate-600">
          <strong>Tarefa:</strong> {run.task}
        </p>
        <p className="mt-1 text-xs text-slate-400">Modelo: {run.modelVersion}</p>
      </Card>

      {isPanel && synthesis && (
        <Card className="border-indigo-200 bg-indigo-50/60">
          <p className="mb-2 text-sm font-semibold text-indigo-900">
            Síntese do painel — onde as personas convergem e divergem
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {!!synthesis.consensus?.length && (
              <div>
                <p className="text-xs font-medium uppercase text-slate-500">Consenso</p>
                <ul className="list-inside list-disc text-sm text-slate-700">
                  {synthesis.consensus.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </div>
            )}
            {!!synthesis.divergence?.length && (
              <div>
                <p className="text-xs font-medium uppercase text-amber-700">Divergência</p>
                <ul className="list-inside list-disc text-sm text-slate-700">
                  {synthesis.divergence.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          {synthesis.segmentation_signal && (
            <p className="mt-3 text-sm text-slate-700">
              <strong>Sinal de segmentação:</strong> {synthesis.segmentation_signal}
            </p>
          )}
          <div className="mt-2">
            <Badge color="violet">síntese gerada por IA — leia como hipótese a investigar, não conclusão</Badge>
          </div>
        </Card>
      )}

      <div className={gridClass}>
        {personaList.map((persona) => {
          const data = dataByPersona.get(persona.id) ?? {};
          return (
            <Card key={persona.id}>
              <p className="mb-2 text-sm font-semibold text-slate-800">
                {persona.name}
                {persona.jobTitle && <span className="font-normal text-slate-500"> — {persona.jobTitle}</span>}
              </p>
              <div className="space-y-2 text-sm">
                {TEXT_ROWS.map(({ key, label }) => (
                  <div key={key}>
                    <p className="text-xs font-medium uppercase text-slate-400">{label}</p>
                    <p className="text-slate-700">{(data[key] as string) || "—"}</p>
                  </div>
                ))}
              </div>
              {LIST_ROWS.map(({ key, label }) => {
                const items = (data[key] as string[] | undefined) ?? [];
                if (!items.length) return null;
                return (
                  <div key={key} className="mt-2">
                    <p className="text-xs font-medium uppercase text-slate-400">{label}</p>
                    <ul className="list-inside list-disc text-sm text-slate-700">
                      {items.map((o, i) => (
                        <li key={i}>{o}</li>
                      ))}
                    </ul>
                  </div>
                );
              })}
              <div className="mt-2">
                <Badge>simulação — não é evidência real</Badge>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
