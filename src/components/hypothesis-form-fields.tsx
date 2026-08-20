import { Card, Field, Input, Label, Select, Textarea } from "@/components/ui/primitives";
import { HYPOTHESIS_TYPES } from "@/lib/hypothesis-types";
import type { hypotheses, personas, products } from "@/db/schema";

type Hypothesis = typeof hypotheses.$inferSelect;
type Persona = typeof personas.$inferSelect;
type Product = typeof products.$inferSelect;

export function HypothesisFormFields({
  defaultValues: d,
  personaOptions,
  productOptions,
  hypothesisOptions = [],
  selectedPersonaIds = [],
  selectedProductIds = [],
}: {
  defaultValues?: Hypothesis;
  personaOptions: Persona[];
  productOptions: Product[];
  hypothesisOptions?: Hypothesis[];
  selectedPersonaIds?: string[];
  selectedProductIds?: string[];
}) {
  const productNameById = new Map(productOptions.map((p) => [p.id, p.name]));

  return (
    <div className="space-y-4">
      <Card>
        <Field>
          <Label>Título da hipótese</Label>
          <Input name="title" required defaultValue={d?.title} placeholder="Escreva em formato testável" />
        </Field>
        <Field>
          <Label>Tipo</Label>
          <Select name="type" defaultValue={d?.type ?? "problem"} required>
            {HYPOTHESIS_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label} — {t.hint}
              </option>
            ))}
          </Select>
        </Field>
        <Field>
          <Label>Descrição</Label>
          <Textarea name="description" rows={3} defaultValue={d?.description ?? ""} />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field>
            <Label>Problema relacionado</Label>
            <Input name="problemRef" defaultValue={d?.problemRef ?? ""} />
          </Field>
          <Field>
            <Label>Solução relacionada</Label>
            <Input name="solutionRef" defaultValue={d?.solutionRef ?? ""} />
          </Field>
        </div>
        <Field>
          <Label>Hipótese relacionada</Label>
          <Select name="relatedHypothesisId" defaultValue={d?.relatedHypothesisId ?? ""}>
            <option value="">— nenhuma —</option>
            {hypothesisOptions
              .filter((h) => h.id !== d?.id)
              .map((h) => (
                <option key={h.id} value={h.id}>
                  {h.title}
                </option>
              ))}
          </Select>
        </Field>
        <Field>
          <Label>Contexto</Label>
          <Textarea name="context" rows={2} defaultValue={d?.context ?? ""} />
        </Field>
        <Field>
          <Label>Método de validação planejado</Label>
          <Input name="validationMethod" defaultValue={d?.validationMethod ?? ""} />
        </Field>
      </Card>
      <Card>
        <Field>
          <Label>Personas relacionadas</Label>
          <select
            name="personaIds"
            multiple
            defaultValue={selectedPersonaIds}
            className="h-32 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            {personaOptions.map((p) => {
              const productName = p.productId ? productNameById.get(p.productId) : undefined;
              return (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.jobTitle ? ` — ${p.jobTitle}` : ""}
                  {productName ? ` — ${productName}` : ""} {p.origin === "synthetic" ? "(sintética)" : ""}
                </option>
              );
            })}
          </select>
        </Field>
        <Field>
          <Label>Produtos/conceitos relacionados</Label>
          <select
            name="productIds"
            multiple
            defaultValue={selectedProductIds}
            className="h-24 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            {productOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
      </Card>
    </div>
  );
}
