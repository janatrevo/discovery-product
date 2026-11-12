import { Button, Field, Input, Label, Select, Textarea } from "@/components/ui/primitives";
import { CATEGORIES, CATEGORY_KEYS, TITLE_SUGGESTIONS, type CalEvent } from "@/lib/project-calendar";

// Formulário usado para registrar e para editar um evento manual do calendário.
export function EventForm({
  action,
  event,
  counterparties,
  opportunities,
  submitLabel,
  idPrefix,
}: {
  action: (formData: FormData) => void | Promise<void>;
  event?: CalEvent;
  counterparties: string[];
  opportunities: { id: string; title: string }[];
  submitLabel: string;
  idPrefix: string;
}) {
  const listId = `${idPrefix}-who`;
  const titlesId = `${idPrefix}-titles`;
  return (
    <form action={action} className="grid gap-x-4 gap-y-1 md:grid-cols-6">
      <div className="md:col-span-2">
        <Field>
          <Label>Tipo</Label>
          <Select name="category" defaultValue={event?.category ?? "marco"} required>
            {CATEGORY_KEYS.map((k) => (
              <option key={k} value={k}>
                {CATEGORIES[k].label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="md:col-span-4">
        <Field>
          <Label>O que aconteceu</Label>
          <Input name="title" list={titlesId} defaultValue={event?.title ?? ""} maxLength={255} required placeholder="Ex.: Laboratório aceitou fazer parte do piloto" />
          <datalist id={titlesId}>
            {TITLE_SUGGESTIONS.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </Field>
      </div>
      <div className="md:col-span-2">
        <Field>
          <Label>Quando aconteceu (ou quando o pedido foi feito)</Label>
          <Input type="date" name="occurredOn" defaultValue={event?.start ?? ""} required />
        </Field>
      </div>
      <div className="md:col-span-2">
        <Field>
          <Label>Quando terminou ou foi respondido (se já)</Label>
          <Input type="date" name="finishedOn" defaultValue={event?.end ?? ""} />
        </Field>
      </div>
      <div className="md:col-span-2">
        <Field>
          <Label>Data prevista (para medir estimado x real)</Label>
          <Input type="date" name="plannedOn" defaultValue={event?.planned ?? ""} />
        </Field>
      </div>
      <div className="md:col-span-2">
        <Field>
          <Label>Com quem (ZDI, Animati, diretoria…)</Label>
          <Input name="counterparty" list={listId} defaultValue={event?.counterparty ?? ""} maxLength={120} placeholder="Opcional" />
          <datalist id={listId}>
            {counterparties.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
      </div>
      <div className="md:col-span-4">
        <Field>
          <Label>Oportunidade ligada (opcional)</Label>
          <Select name="opportunityId" defaultValue={event?.opportunityId ?? ""}>
            <option value="">Nenhuma</option>
            {opportunities.map((o) => (
              <option key={o.id} value={o.id}>
                {o.title}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="md:col-span-6">
        <Field>
          <Label>Anotações (opcional)</Label>
          <Textarea name="notes" rows={2} defaultValue={event?.notes ?? ""} placeholder="Quem participou, o que foi combinado, link da conversa…" />
        </Field>
      </div>
      <div className="md:col-span-6">
        <p className="mb-2 text-xs text-slate-500">
          Pedido a terceiros: a data do pedido vai em “quando aconteceu” e a da resposta em “terminou ou foi respondido”. Sem a resposta, o pedido
          fica em “aguardando” e a espera é contada até hoje.
        </p>
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
  );
}
