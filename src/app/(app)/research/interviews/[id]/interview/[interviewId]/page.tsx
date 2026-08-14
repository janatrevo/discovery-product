import { notFound } from "next/navigation";
import { db } from "@/db";
import { interviews, codes, codedSegments, interviewGuides, hypotheses, evidence } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { getPageContext } from "@/lib/page-context";
import { Badge, Button, Card, Field, Input, Label, PageHeader, Select } from "@/components/ui/primitives";
import {
  addCodedSegment,
  confirmSegment,
  deleteSegment,
  runAiCodeSuggestion,
  promoteInterviewToEvidence,
} from "../../../actions";
import { isAiEnabled } from "@/lib/ai";

export default async function InterviewDetailPage({
  params,
}: {
  params: Promise<{ id: string; interviewId: string }>;
}) {
  const { id: guideId, interviewId } = await params;
  const { project, role } = await getPageContext();
  const [interview] = await db.select().from(interviews).where(eq(interviews.id, interviewId)).limit(1);
  if (!interview || interview.projectId !== project.id) notFound();

  const [codeOptions, segments, guideRows, hypothesisList, promotedEvidenceRows] = await Promise.all([
    db.select().from(codes).where(eq(codes.projectId, project.id)),
    db
      .select({ seg: codedSegments, code: codes })
      .from(codedSegments)
      .innerJoin(codes, eq(codes.id, codedSegments.codeId))
      .where(eq(codedSegments.interviewId, interviewId))
      .orderBy(desc(codedSegments.createdAt)),
    db.select().from(interviewGuides).where(eq(interviewGuides.id, guideId)).limit(1),
    db.select().from(hypotheses).where(eq(hypotheses.projectId, project.id)),
    db.select().from(evidence).where(eq(evidence.sourceInterviewId, interviewId)).limit(1),
  ]);
  const guide = guideRows[0];
  const promotedEvidence = promotedEvidenceRows[0];
  const confirmedCount = segments.filter((s) => s.seg.confirmed).length;

  const canEdit = role !== "viewer";

  return (
    <div className="max-w-4xl grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card className="lg:col-span-2">
        <PageHeader title={`Entrevista — ${interview.intervieweeRef || "sem identificação"}`} />
        <p className="whitespace-pre-wrap text-sm text-slate-700">{interview.transcript}</p>
      </Card>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-700">Codificação</p>
          {canEdit && (
            <form action={runAiCodeSuggestion.bind(null, interviewId)}>
              <Button type="submit" size="sm" variant="secondary">
                {isAiEnabled() ? "IA: sugerir códigos" : "IA (modo demo): sugerir códigos"}
              </Button>
            </form>
          )}
        </div>

        {canEdit && (
          <form action={addCodedSegment.bind(null, interviewId)} className="mb-4 space-y-2 rounded-md bg-slate-50 p-3">
            <Field>
              <Label>Trecho (excerpt)</Label>
              <Input name="excerpt" required placeholder="Cole o trecho exato da transcrição" />
            </Field>
            <div className="flex gap-2">
              <Select name="codeId" defaultValue="">
                <option value="">Novo código →</option>
                {codeOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
              <Input name="newCodeName" placeholder="Nome do novo código" />
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-500">
              <input type="checkbox" name="isQuote" value="true" /> Marcar como quote representativa
            </label>
            <Button type="submit" size="sm">
              Adicionar
            </Button>
          </form>
        )}

        <ul className="space-y-2">
          {segments.map(({ seg, code }) => (
            <li key={seg.id} className="rounded-md border border-slate-100 p-2 text-sm">
              <div className="mb-1 flex items-center gap-2">
                <Badge color="indigo">{code.name}</Badge>
                {seg.aiSuggested && !seg.confirmed && <Badge color="amber">sugestão de IA — não confirmada</Badge>}
                {seg.isRepresentativeQuote && <Badge color="violet">quote</Badge>}
              </div>
              <p className="text-slate-700">&ldquo;{seg.excerpt}&rdquo;</p>
              {canEdit && (
                <div className="mt-1 flex gap-3 text-xs">
                  {!seg.confirmed && (
                    <form action={confirmSegment.bind(null, seg.id)}>
                      <button className="text-emerald-600 hover:underline">confirmar</button>
                    </form>
                  )}
                  <form action={deleteSegment.bind(null, seg.id)}>
                    <button className="text-red-500 hover:underline">remover</button>
                  </form>
                </div>
              )}
            </li>
          ))}
          {segments.length === 0 && <p className="text-sm text-slate-400">Nenhum código aplicado ainda.</p>}
        </ul>

        {canEdit && confirmedCount > 0 && (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <p className="mb-1 text-sm font-semibold text-slate-700">Promover para Evidência real</p>
            <p className="mb-2 text-xs text-slate-500">
              Usa os {confirmedCount} trecho(s) confirmado(s) como conteúdo da evidência — sem isso,
              esta entrevista não conta para o Confidence Score de nenhuma hipótese.
            </p>
            {promotedEvidence && (
              <p className="mb-2 text-xs text-emerald-700">
                ✓ Já promovida — última atualização {new Date(promotedEvidence.createdAt).toLocaleDateString("pt-BR")}.
              </p>
            )}
            <form action={promoteInterviewToEvidence.bind(null, interviewId)} className="flex flex-wrap items-end gap-2">
              {!guide?.hypothesisId && (
                <Select name="hypothesisId" defaultValue="" className="max-w-xs">
                  <option value="">Selecione a hipótese...</option>
                  {hypothesisList.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.title}
                    </option>
                  ))}
                </Select>
              )}
              <Select name="favorable" className="w-40" defaultValue="true">
                <option value="true">Favorável</option>
                <option value="false">Contrária</option>
              </Select>
              <Button type="submit" size="sm" variant="secondary">
                {promotedEvidence ? "Atualizar evidência" : "Promover para evidência"}
              </Button>
            </form>
          </div>
        )}
      </Card>
    </div>
  );
}
