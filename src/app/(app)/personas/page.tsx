import Link from "next/link";
import { getPageContext } from "@/lib/page-context";
import { db } from "@/db";
import { personas, products } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { Badge, Button, Card, EmptyState, PageHeader } from "@/components/ui/primitives";

export default async function PersonasPage() {
  const { project } = await getPageContext();
  const [list, productList] = await Promise.all([
    db.select().from(personas).where(eq(personas.projectId, project.id)).orderBy(desc(personas.createdAt)),
    db.select().from(products).where(eq(products.projectId, project.id)),
  ]);
  // Mostrado direto no card — quando o mesmo produto tem várias personas
  // (ou personas parecidas de produtos diferentes), o nome do produto e o
  // contexto profissional ajudam a diferenciar sem precisar abrir cada uma.
  const productName = (id: string | null) => productList.find((p) => p.id === id)?.name;

  return (
    <div>
      <PageHeader
        title="Personas"
        description="Biblioteca de personas — research-based ou sintética, sempre com a origem visível."
        actions={
          <Link href="/personas/new">
            <Button>+ Nova persona</Button>
          </Link>
        }
      />

      {list.length === 0 ? (
        <EmptyState
          title="Nenhuma persona ainda"
          description="Personas são o sujeito de toda hipótese. Crie a primeira a partir de uma pesquisa real ou de uma persona sintética para exploração inicial."
          action={
            <Link href="/personas/new">
              <Button>Criar primeira persona</Button>
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((p) => (
            <Link key={p.id} href={`/personas/${p.id}`}>
              <Card className="h-full transition-shadow hover:shadow-md">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <p className="font-medium text-slate-900">{p.name}</p>
                  <Badge color={p.origin === "research_based" ? "emerald" : "amber"}>
                    {p.origin === "research_based" ? "Research-based" : "Sintética — não validada"}
                  </Badge>
                </div>
                <p className="line-clamp-2 text-sm text-slate-500">{p.shortDescription}</p>
                {p.productId && (
                  <p className="mt-2 truncate text-xs text-slate-400">Produto: {productName(p.productId) ?? "—"}</p>
                )}
                {p.professionalContext && (
                  <p className="mt-1 line-clamp-2 text-xs text-slate-400">Contexto profissional: {p.professionalContext}</p>
                )}
                <div className="mt-3 h-1.5 w-full rounded-full bg-slate-100">
                  <div
                    className="h-1.5 rounded-full bg-indigo-500"
                    style={{ width: `${p.completeness}%` }}
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-400">{p.completeness}% preenchido</p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
