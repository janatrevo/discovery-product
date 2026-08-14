import Link from "next/link";
import { getPageContext } from "@/lib/page-context";
import { db } from "@/db";
import { products } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { Badge, Button, Card, EmptyState, PageHeader } from "@/components/ui/primitives";

export default async function ProductsPage() {
  const { project } = await getPageContext();
  const list = await db
    .select()
    .from(products)
    .where(eq(products.projectId, project.id))
    .orderBy(desc(products.createdAt));

  return (
    <div>
      <PageHeader
        title="Products & Concepts"
        description="Produtos, features, conceitos, landing pages e protótipos que podem ser avaliados por personas."
        actions={
          <Link href="/products/new">
            <Button>+ Novo produto/conceito</Button>
          </Link>
        }
      />
      {list.length === 0 ? (
        <EmptyState
          title="Nenhum produto ou conceito ainda"
          description="Cadastre um produto existente, uma feature nova ou um conceito para poder testá-lo com personas e vincular a hipóteses."
          action={
            <Link href="/products/new">
              <Button>Criar primeiro produto</Button>
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((p) => (
            <Link key={p.id} href={`/products/${p.id}`}>
              <Card className="h-full transition-shadow hover:shadow-md">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <p className="font-medium text-slate-900">{p.name}</p>
                  {p.category && <Badge>{p.category}</Badge>}
                </div>
                <p className="line-clamp-2 text-sm text-slate-500">{p.description}</p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
