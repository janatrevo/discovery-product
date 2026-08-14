import { createProduct } from "../actions";
import { ProductFormFields } from "@/components/product-form-fields";
import { Button, PageHeader } from "@/components/ui/primitives";

export default function NewProductPage() {
  return (
    <div>
      <PageHeader title="Novo produto / conceito" />
      <form action={createProduct} className="max-w-3xl">
        <ProductFormFields />
        <div className="mt-6 flex gap-2">
          <Button type="submit">Criar</Button>
        </div>
      </form>
    </div>
  );
}
