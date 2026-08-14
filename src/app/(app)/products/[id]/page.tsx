import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { products } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getPageContext } from "@/lib/page-context";
import { Badge, Button, Card, PageHeader } from "@/components/ui/primitives";
import { deleteProduct } from "../actions";

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
            {(role === "owner" || role === "editor") && (
              <form action={deleteProduct.bind(null, id)}>
                <Button variant="danger" type="submit">
                  Excluir
                </Button>
              </form>
            )}
          </>
        }
      />
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
