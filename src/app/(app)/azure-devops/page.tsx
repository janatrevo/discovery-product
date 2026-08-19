import Link from "next/link";
import { getPageContext } from "@/lib/page-context";
import { listFeatures, parseAbTag, featureStateColor as stateColor } from "@/lib/azure-devops";
import { Badge, Button, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { deleteAzureFeature } from "./actions";

const AB_TAG_LABELS: Record<string, string> = {
  testing: "Em teste A/B",
  keep: "Manter permanentemente",
  remove: "Remover após o teste",
};
const AB_TAG_COLORS: Record<string, "amber" | "emerald" | "red"> = { testing: "amber", keep: "emerald", remove: "red" };

export default async function AzureDevOpsPage() {
  const { role } = await getPageContext();
  const isOwner = role === "owner";

  let features: Awaited<ReturnType<typeof listFeatures>> = [];
  let loadError: string | null = null;
  try {
    features = await listFeatures();
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Não foi possível carregar os cards do Azure DevOps.";
  }

  return (
    <div>
      <PageHeader
        title="Azure DevOps — Trevo Labs"
        description="Cards do tipo Feature do board da equipe, sincronizados em tempo real com o Azure DevOps."
        actions={
          <>
            <Link href="/azure-devops/roadmap">
              <Button variant="secondary">📊 Roadmap (Gantt)</Button>
            </Link>
            {isOwner && (
              <Link href="/azure-devops/new">
                <Button>+ Nova Feature</Button>
              </Link>
            )}
          </>
        }
      />

      {loadError ? (
        <EmptyState
          title="Não foi possível conectar ao Azure DevOps"
          description={loadError}
        />
      ) : features.length === 0 ? (
        <EmptyState
          title="Nenhuma Feature no board ainda"
          description="Crie a primeira Feature diretamente por aqui — ela aparece no board Trevo Labs do Azure DevOps na hora."
          action={
            isOwner ? (
              <Link href="/azure-devops/new">
                <Button>Criar primeira Feature</Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          {features.map((f) => {
            const abDecision = parseAbTag(f.tags);
            const otherTags = f.tags.filter((t) => !t.toLowerCase().startsWith("ab:"));
            return (
            <Card key={f.id}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="text-xs text-slate-400">#{f.id}</span>
                    <Badge color={stateColor(f.state)}>{f.state}</Badge>
                    {abDecision && <Badge color={AB_TAG_COLORS[abDecision]}>{AB_TAG_LABELS[abDecision]}</Badge>}
                    {otherTags.map((t) => (
                      <Badge key={t} color="indigo">
                        {t}
                      </Badge>
                    ))}
                  </div>
                  <p className="font-medium text-slate-900">{f.title}</p>
                  {f.description && <p className="mt-1 line-clamp-2 text-sm text-slate-500">{f.description}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {f.url && (
                    <a href={f.url} target="_blank" rel="noreferrer">
                      <Button variant="secondary" size="sm">
                        Abrir no board
                      </Button>
                    </a>
                  )}
                  {isOwner && (
                    <>
                      <Link href={`/azure-devops/${f.id}/edit`}>
                        <Button variant="secondary" size="sm">
                          Editar
                        </Button>
                      </Link>
                      <form action={deleteAzureFeature.bind(null, f.id)}>
                        <Button type="submit" variant="danger" size="sm">
                          Excluir
                        </Button>
                      </form>
                    </>
                  )}
                </div>
              </div>
            </Card>
            );
          })}
        </div>
      )}

      {!isOwner && !loadError && (
        <p className="mt-4 text-xs text-slate-400">
          Só administradores (Owner) podem criar, editar ou excluir Features no board.
        </p>
      )}
    </div>
  );
}
