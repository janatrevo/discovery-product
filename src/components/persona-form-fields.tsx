import { Card, Field, Input, Label, Select, Textarea } from "@/components/ui/primitives";
import { arrayToLines } from "@/lib/list-utils";
import type { personas, products } from "@/db/schema";

type Persona = typeof personas.$inferSelect;
type Product = typeof products.$inferSelect;

export function PersonaFormFields({
  defaultValues,
  products = [],
}: {
  defaultValues?: Persona;
  products?: Product[];
}) {
  const d = defaultValues;
  return (
    <div className="space-y-4">
      <Card>
        <p className="mb-3 text-sm font-semibold text-slate-700">Essencial</p>
        <Field>
          <Label>Nome</Label>
          <Input name="name" required defaultValue={d?.name} />
        </Field>
        <Field>
          <Label>Origem</Label>
          <Select name="origin" defaultValue={d?.origin ?? "synthetic"} required>
            <option value="synthetic">Sintética — para exploração inicial</option>
            <option value="research_based">Research-based — exige fonte de evidência</option>
          </Select>
        </Field>
        <Field>
          <Label>Produto vinculado</Label>
          <Select name="productId" defaultValue={d?.productId ?? ""}>
            <option value="">— nenhum —</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field>
          <Label>Descrição curta</Label>
          <Textarea name="shortDescription" rows={2} defaultValue={d?.shortDescription ?? ""} />
        </Field>
        <Field>
          <Label>JTBD principal</Label>
          <Input
            name="jtbdMain"
            placeholder='"Quando [situação], eu quero [motivação], para [resultado esperado]"'
            defaultValue={d?.jtbdMain ?? ""}
          />
        </Field>
        <Field>
          <Label>Fontes (uma por linha — obrigatório se research-based)</Label>
          <Textarea name="sources" rows={2} defaultValue={arrayToLines(d?.sources)} />
        </Field>
      </Card>

      <Card>
        <p className="mb-3 text-sm font-semibold text-slate-700">Contexto</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field>
            <Label>Contexto profissional</Label>
            <Textarea name="professionalContext" rows={2} defaultValue={d?.professionalContext ?? ""} />
          </Field>
          <Field>
            <Label>Contexto pessoal relevante</Label>
            <Textarea name="personalContext" rows={2} defaultValue={d?.personalContext ?? ""} />
          </Field>
          <Field>
            <Label>Contexto de uso</Label>
            <Textarea name="usageContext" rows={2} defaultValue={d?.usageContext ?? ""} />
          </Field>
          <Field>
            <Label>Contexto de compra</Label>
            <Textarea name="purchaseContext" rows={2} defaultValue={d?.purchaseContext ?? ""} />
          </Field>
          <Field>
            <Label>Familiaridade tecnológica</Label>
            <Input name="techFamiliarity" defaultValue={d?.techFamiliarity ?? ""} />
          </Field>
          <Field>
            <Label>Sensibilidade a preço</Label>
            <Input name="priceSensitivity" defaultValue={d?.priceSensitivity ?? ""} />
          </Field>
          <Field>
            <Label>Conhecimento sobre o problema</Label>
            <Input name="problemKnowledge" defaultValue={d?.problemKnowledge ?? ""} />
          </Field>
          <Field>
            <Label>Conhecimento sobre soluções</Label>
            <Input name="solutionKnowledge" defaultValue={d?.solutionKnowledge ?? ""} />
          </Field>
        </div>
      </Card>

      <Card>
        <p className="mb-3 text-sm font-semibold text-slate-700">Comportamental (um item por linha)</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[
            ["goals", "Objetivos"],
            ["pains", "Dores"],
            ["frustrations", "Frustrações"],
            ["needs", "Necessidades"],
            ["motivations", "Motivações"],
            ["behaviors", "Comportamentos/Hábitos"],
            ["fears", "Medos"],
            ["objections", "Objeções"],
            ["decisionCriteria", "Critérios de decisão"],
          ].map(([field, label]) => (
            <Field key={field}>
              <Label>{label}</Label>
              <Textarea name={field} rows={3} defaultValue={arrayToLines((d as never)?.[field])} />
            </Field>
          ))}
        </div>
      </Card>

      <Card>
        <p className="mb-3 text-sm font-semibold text-slate-700">Evidência de apoio e linguagem</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field>
            <Label>Citações reais (uma por linha)</Label>
            <Textarea name="realQuotes" rows={3} defaultValue={arrayToLines(d?.realQuotes)} />
          </Field>
          <Field>
            <Label>Alternativas atuais (uma por linha)</Label>
            <Textarea name="currentAlternatives" rows={3} defaultValue={arrayToLines(d?.currentAlternatives)} />
          </Field>
          <Field>
            <Label>Produtos concorrentes usados (um por linha)</Label>
            <Textarea name="competitorProducts" rows={3} defaultValue={arrayToLines(d?.competitorProducts)} />
          </Field>
          <Field>
            <Label>Linguagem característica / tom</Label>
            <Textarea
              name="characteristicLanguage"
              rows={3}
              defaultValue={d?.characteristicLanguage ?? ""}
              placeholder="Usado para calibrar tom na Simulação de IA, sem inventar fatos sobre a persona."
            />
          </Field>
        </div>
      </Card>
    </div>
  );
}
