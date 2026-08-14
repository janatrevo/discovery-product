import { notFound } from "next/navigation";
import { db } from "@/db";
import { products } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getPageContext } from "@/lib/page-context";
import { ProductFormFields } from "@/components/product-form-fields";
import { Button, PageHeader } from "@/components/ui/primitives";
import { updateProduct } from "../../actions";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { project } = await getPageContext();
  const [product] = await db.select().from(products).where(eq(products.id, id)).limit(1);
  if (!product || product.projectId !== project.id) notFound();

  return (
    <div>
      <PageHeader title={`Editar: ${product.name}`} />
      <form action={updateProduct.bind(null, id)} className="max-w-3xl">
        <ProductFormFields defaultValues={product} />
        <div className="mt-6 flex gap-2">
          <Button type="submit">Salvar</Button>
        </div>
      </form>
    </div>
  );
}
