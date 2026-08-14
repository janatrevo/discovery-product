import { db } from "@/db";
import { evidence, hypothesisEvidence, personas } from "@/db/schema";
import { eq, and, notInArray } from "drizzle-orm";
import { Button, Card, Field, Input, Label, Select, Textarea } from "@/components/ui/primitives";
import { OriginBadge } from "@/components/origin-badge";
import { addEvidence, linkExistingEvidence, unlinkEvidence } from "@/app/(app)/hypotheses/[id]/evidence-actions";

const EVIDENCE_TYPES = [
  { value: "interview", label: "Entrevista" },
  { value: "survey", label: "Survey" },
  { value: "usability_test", label: "Teste de usabilidade" },
  { value: "behavioral", label: "Dado comportamental" },
  { value: "experiment", label: "Experimento" },
  { value: "manual", label: "Outro / manual" },
];

export async function EvidenceTab({
  hypothesisId,
  projectId,
  role,
}: {
  hypothesisId: string;
  projectId: string;
  role: string;
}) {
  const links = await db
    .select({ ev: evidence, favorable: hypothesisEvidence.favorable })
    .from(hypothesisEvidence)
    .innerJoin(evidence, eq(evidence.id, hypothesisEvidence.evidenceId))
    .where(eq(hypothesisEvidence.hypothesisId, hypothesisId));

  const linkedIds = links.map((l) => l.ev.id);
  const otherEvidence = await db
    .select()
    .from(evidence)
    .where(
      linkedIds.length
        ? and(eq(evidence.projectId, projectId), notInArray(evidence.id, linkedIds))
        : eq(evidence.projectId, projectId)
    );

  const personaOptions = await db.select().from(personas).where(eq(personas.projectId, projectId));

  const favorable = links.filter((l) => l.favorable);
  const contrary = links.filter((l) => !l.favorable);
  const canEdit = role !== "viewer";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <p className="mb-2 text-sm font-semibold text-emerald-700">
            Por que acreditamos que é verdadeira ({favorable.length})
          </p>
          {favorable.length === 0 ? (
            <p className="text-sm text-slate-400">Nenhuma evidência favorável ainda.</p>
          ) : (
            <ul className="space-y-2">
              {favorable.map((l) => (
                <EvidenceRow key={l.ev.id} ev={l.ev} hypothesisId={hypothesisId} canEdit={canEdit} />
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <p className="mb-2 text-sm font-semibold text-red-700">O que contradiz ({contrary.length})</p>
          {contrary.length === 0 ? (
            <p className="text-sm text-slate-400">Nenhuma evidência contrária registrada.</p>
          ) : (
            <ul className="space-y-2">
              {contrary.map((l) => (
                <EvidenceRow key={l.ev.id} ev={l.ev} hypothesisId={hypothesisId} canEdit={canEdit} />
              ))}
            </ul>
          )}
        </Card>
      </div>

      {canEdit && (
        <Card>
          <p className="mb-3 text-sm font-semibold text-slate-700">Adicionar evidência real</p>
          <form action={addEvidence.bind(null, hypothesisId)} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field>
              <Label>Fonte</Label>
              <Input name="source" required placeholder="Ex.: Entrevista com 5 gerentes de marketing" />
            </Field>
            <Field>
              <Label>Tipo / método</Label>
              <Select name="type" defaultValue="interview">
                {EVIDENCE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field>
              <Label>Persona</Label>
              <Select name="personaId" defaultValue="">
                <option value="">—</option>
                {personaOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field>
              <Label>Favorável ou contrária à hipótese?</Label>
              <Select name="favorable" defaultValue="true">
                <option value="true">Favorável</option>
                <option value="false">Contrária</option>
              </Select>
            </Field>
            <Field>
              <Label>Tamanho de amostra (se aplicável)</Label>
              <Input name="sampleSize" type="number" min={1} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field>
                <Label>Qualidade (0-100)</Label>
                <Input name="qualityScore" type="number" min={0} max={100} defaultValue={70} />
              </Field>
              <Field>
                <Label>Confiabilidade (0-100)</Label>
                <Input name="reliabilityScore" type="number" min={0} max={100} defaultValue={70} />
              </Field>
            </div>
            <Field>
              <Label>Contexto</Label>
              <Input name="context" />
            </Field>
            <div className="sm:col-span-2">
              <Field>
                <Label>Conteúdo / trecho / resumo</Label>
                <Textarea name="content" rows={3} required />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Button type="submit">Adicionar evidência</Button>
            </div>
          </form>
        </Card>
      )}

      {canEdit && otherEvidence.length > 0 && (
        <Card>
          <p className="mb-3 text-sm font-semibold text-slate-700">Vincular evidência já existente no projeto</p>
          <form action={linkExistingEvidence.bind(null, hypothesisId)} className="flex flex-wrap items-end gap-2">
            <Select name="evidenceId" className="max-w-md">
              {otherEvidence.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.source} ({e.type})
                </option>
              ))}
            </Select>
            <Select name="favorable" className="w-40">
              <option value="true">Favorável</option>
              <option value="false">Contrária</option>
            </Select>
            <Button type="submit" variant="secondary">
              Vincular
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}

function EvidenceRow({
  ev,
  hypothesisId,
  canEdit,
}: {
  ev: typeof evidence.$inferSelect;
  hypothesisId: string;
  canEdit: boolean;
}) {
  return (
    <li className="rounded-md border border-slate-100 p-2 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium text-slate-800">{ev.source}</p>
          <p className="text-xs text-slate-500">{ev.content}</p>
        </div>
        <OriginBadge originClass={ev.originClass} />
      </div>
      <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
        <span>
          {ev.type} · qualidade {ev.qualityScore} · confiabilidade {ev.reliabilityScore}
          {ev.sampleSize ? ` · n=${ev.sampleSize}` : ""}
        </span>
        {canEdit && (
          <form action={unlinkEvidence.bind(null, hypothesisId, ev.id)}>
            <button type="submit" className="text-red-500 hover:underline">
              desvincular
            </button>
          </form>
        )}
      </div>
    </li>
  );
}
