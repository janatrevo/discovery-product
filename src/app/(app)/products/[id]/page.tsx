import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { products, simulationRuns, personas } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getPageContext } from "@/lib/page-context";
import { Badge, Button, Card, PageHeader } from "@/components/ui/primitives";
import { deleteProduct } from "../actions";
import { deleteSimulation } from "../../simulations/actions";
import { unlinkProductFromPersona } from "../../personas/actions";

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

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { project, role } = await getPageContext();
  const [product] = await db.select().from(products).where(eq(products.id, id)).limit(1);
  if (!product || product.projectId !== project.id) notFound();
  const canDelete = role === "owner" || role === "editor";

  // Antes disto, o botão "Excluir" chamava deleteProduct direto, que joga um
  // Error quando checkProductDeletable acha algo vinculado (ver
  // src/lib/delete-guards.ts) — o Next.js mostra isso como uma tela de
  // "Runtime Error" cheia de stack trace, parecendo um bug, quando na
  // verdade é a proteção funcionando (evita deixar uma simulação órfã).
  // O problema real era não ter, nesta própria página, como ver ou excluir
  // o que estava bloqueando — daí a pessoa ficar presa sem saber o que
  // fazer. Agora a página busca essas simulações e deixa excluir cada uma
  // direto por aqui, sem crash e sem precisar procurar em /simulations.
  const [blockingSimulations, blockingPersonas] = canDelete
    ? await Promise.all([
        db.select().from(simulationRuns).where(eq(simulationRuns.productId, id)),
        db.select().from(personas).where(eq(personas.productId, id)),
      ])
    : [[], []];
  const canDeleteNow = canDelete && blockingSimulations.length === 0 && blockingPersonas.length === 0;

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={product.name}
        description={product.description ?? undefined}
        actions={
          <>
            {product.category && <Badge>{product.category}</Badge>}
            <Link href={`/products/${id}/edit`}>
              <Button variant="secondary">Editar</Button>
            </Link>
            {canDeleteNow && (
              <form action={deleteProduct.bind(null, id)}>
                <Button variant="danger" type="submit">
                  Excluir
                </Button>
              </form>
            )}
          </>
        }
      />
      {canDelete && (blockingSimulations.length > 0 || blockingPersonas.length > 0) && (
        <Card className="mb-4 border-amber-300 bg-amber-50">
          <p className="text-sm font-medium text-amber-900">
            Este produto não pode ser excluído ainda
          </p>
          <p className="mt-1 text-sm text-amber-800">
            Desvincule (ou exclua, no caso de simulações) as referências abaixo para liberar a exclusão.
          </p>

          {blockingPersonas.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold uppercase text-amber-700">
                Personas ({blockingPersonas.length})
              </p>
              <div className="mt-1 space-y-2">
                {blockingPersonas.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-2 rounded-md border border-amber-200 bg-white px-3 py-2"
                  >
                    <Link href={`/personas/${p.id}`} className="min-w-0 flex-1">
                      <p className="truncate text-sm text-slate-800">
                        {p.name}
                        {p.jobTitle ? ` — ${p.jobTitle}` : ""}
                      </p>
                    </Link>
                    <form action={unlinkProductFromPersona.bind(null, p.id, id)}>
                      <Button type="submit" variant="ghost" size="sm">
                        desvincular
                      </Button>
                    </form>
                  </div>
                ))}
              </div>
            </div>
          )}

          {blockingSimulations.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold uppercase text-amber-700">
                Simulações ({blockingSimulations.length})
              </p>
              <div className="mt-1 space-y-2">
                {blockingSimulations.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between gap-2 rounded-md border border-amber-200 bg-white px-3 py-2"
                  >
                    <Link href={`/simulations/${s.id}`} className="min-w-0 flex-1">
                      <p className="truncate text-sm text-slate-800">{s.scenario || "Cenário sem título"}</p>
                      <p className="truncate text-xs text-slate-400">{s.task}</p>
                    </Link>
                    <form action={deleteSimulation.bind(null, s.id, `/products/${id}`)}>
                      <Button type="submit" variant="ghost" size="sm">
                        excluir simulação
                      </Button>
                    </form>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}
      <Card className="mb-4 space-y-3">
        {product.problemSolved && (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Problema que resolve</p>
            <p className="text-sm text-slate-700">{product.problemSolved}</p>
          </div>
        )}
        {product.valueProposition && (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Proposta de valor</p>
            <p className="text-sm text-slate-700">{product.valueProposition}</p>
          </div>
        )}
        {product.targetAudience && (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Público-alvo</p>
            <p className="text-sm text-slate-700">{product.targetAudience}</p>
          </div>
        )}
        <div className="flex gap-4 text-sm text-slate-500">
          {product.price && <span>Preço: {product.price}</span>}
          {product.businessModel && <span>Modelo: {product.businessModel}</span>}
          <span>Versão: {product.version}</span>
        </div>
      </Card>
      <Card className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Block title="Funcionalidades" items={product.features as string[]} />
        <Block title="Benefícios" items={product.benefits as string[]} />
        <Block title="Diferenciais" items={product.differentiators as string[]} />
        <Block title="Limitações" items={product.limitations as string[]} />
        <Block title="Concorrentes" items={product.competitors as string[]} />
      </Card>
    </div>
  );
}
