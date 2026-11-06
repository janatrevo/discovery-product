import { Button, Field, Input, Label, Textarea } from "@/components/ui/primitives";
import { AudioUploadField } from "@/components/audio-upload-field";
import { createObservationAudioUpload } from "@/app/(app)/experiments/observation-actions";

export type ObservationFormValues = {
  title?: string | null;
  site?: string | null;
  area?: string | null;
  personName?: string | null;
  personRole?: string | null;
  observedAt?: Date | null;
  systemsUsed?: string | null;
  notes?: string | null;
  transcript?: string | null;
  hasAudio?: boolean;
};

function dateInputValue(d: Date | null | undefined) {
  const date = d ?? new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Formulário único para criar e editar um registro de observação em campo.
// Gravação e transcrição são opcionais: dá para registrar só com anotações
// (quando não foi possível gravar).
export function FieldObservationForm({
  action,
  values = {},
  submitLabel,
  defaultSite,
}: {
  action: (formData: FormData) => Promise<void>;
  values?: ObservationFormValues;
  submitLabel: string;
  defaultSite?: string;
}) {
  return (
    <form action={action} className="space-y-1">
      <Field>
        <Label>Título do registro *</Label>
        <Input name="title" required defaultValue={values.title ?? ""} placeholder="Ex.: Gerente do call center — Ângela" />
      </Field>
      <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
        <Field>
          <Label>Laboratório / unidade</Label>
          <Input name="site" defaultValue={values.site ?? defaultSite ?? ""} placeholder="Ex.: ZDI" />
        </Field>
        <Field>
          <Label>Setor observado</Label>
          <Input name="area" defaultValue={values.area ?? ""} placeholder="Ex.: Call center, recepção, coleta" />
        </Field>
        <Field>
          <Label>Pessoa</Label>
          <Input name="personName" defaultValue={values.personName ?? ""} />
        </Field>
        <Field>
          <Label>Cargo / função</Label>
          <Input name="personRole" defaultValue={values.personRole ?? ""} />
        </Field>
        <Field>
          <Label>Data da observação</Label>
          <Input name="observedAt" type="date" defaultValue={dateInputValue(values.observedAt)} />
        </Field>
      </div>
      <Field>
        <Label>Sistemas e ferramentas que aparecem</Label>
        <Textarea
          name="systemsUsed"
          rows={2}
          defaultValue={values.systemsUsed ?? ""}
          placeholder="Ex.: sistema de atendimento, WhatsApp, planilha de agenda, telefonia..."
        />
      </Field>
      <Field>
        <Label>Anotações de campo</Label>
        <Textarea
          name="notes"
          rows={8}
          defaultValue={values.notes ?? ""}
          placeholder="O que você viu e ouviu: passos do dia a dia, retrabalho, planilhas paralelas, gargalos, frases marcantes..."
        />
        <p className="mt-1 text-xs text-slate-500">
          Se não houve gravação, as anotações são o registro principal — escreva com o máximo de detalhe.
        </p>
      </Field>
      <Field>
        <Label>Gravação (opcional)</Label>
        <AudioUploadField createUploadUrl={createObservationAudioUpload} hasExisting={!!values.hasAudio} />
      </Field>
      <Field>
        <Label>Transcrição (opcional)</Label>
        <Textarea name="transcript" rows={8} defaultValue={values.transcript ?? ""} />
        <p className="mt-1 text-xs text-slate-500">
          Uma fala por linha, ex.: [00:12] Ângela: texto. Ao salvar, os participantes são identificados de novo
          (renomeações feitas na tela serão substituídas pelo que estiver aqui).
        </p>
      </Field>
      <Button type="submit">{submitLabel}</Button>
    </form>
  );
}
