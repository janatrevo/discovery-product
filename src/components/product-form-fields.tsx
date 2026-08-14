import { Card, Field, Input, Label, Textarea } from "@/components/ui/primitives";
import { arrayToLines } from "@/lib/list-utils";
import type { products } from "@/db/schema";

type Product = typeof products.$inferSelect;

export function ProductFormFields({ defaultValues: d }: { defaultValues?: Product }) {
  return (
    <div className="space-y-4">
      <Card>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field>
            <Label>Nome</Label>
            <Input name="name" required defaultValue={d?.name} />
          </Field>
          <Field>
            <Label>Categoria</Label>
            <Input name="category" defaultValue={d?.category ?? ""} />
          </Field>
        </div>
        <Field>
          <Label>Descrição</Label>
          <Textarea name="description" rows={2} defaultValue={d?.description ?? ""} />
        </Field>
        <Field>
          <Label>Problema que resolve</Label>
          <Textarea name="problemSolved" rows={2} defaultValue={d?.problemSolved ?? ""} />
        </Field>
        <Field>
          <Label>Público-alvo</Label>
          <Textarea name="targetAudience" rows={2} defaultValue={d?.targetAudience ?? ""} />
        </Field>
        <Field>
          <Label>Proposta de valor</Label>
          <Textarea name="valueProposition" rows={2} defaultValue={d?.valueProposition ?? ""} />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field>
            <Label>Preço</Label>
            <Input name="price" defaultValue={d?.price ?? ""} />
          </Field>
          <Field>
            <Label>Modelo de negócio</Label>
            <Input name="businessModel" defaultValue={d?.businessModel ?? ""} />
          </Field>
          <Field>
            <Label>Versão</Label>
            <Input name="version" defaultValue={d?.version ?? "v1"} />
          </Field>
        </div>
      </Card>
      <Card>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field>
            <Label>Funcionalidades (uma por linha)</Label>
            <Textarea name="features" rows={4} defaultValue={arrayToLines(d?.features)} />
          </Field>
          <Field>
            <Label>Benefícios (uma por linha)</Label>
            <Textarea name="benefits" rows={4} defaultValue={arrayToLines(d?.benefits)} />
          </Field>
          <Field>
            <Label>Diferenciais (uma por linha)</Label>
            <Textarea name="differentiators" rows={4} defaultValue={arrayToLines(d?.differentiators)} />
          </Field>
          <Field>
            <Label>Limitações (uma por linha)</Label>
            <Textarea name="limitations" rows={4} defaultValue={arrayToLines(d?.limitations)} />
          </Field>
          <Field>
            <Label>Concorrentes (um por linha)</Label>
            <Textarea name="competitors" rows={4} defaultValue={arrayToLines(d?.competitors)} />
          </Field>
        </div>
      </Card>
    </div>
  );
}
