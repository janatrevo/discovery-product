import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { experiments, fieldObservations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getPageContext } from "@/lib/page-context";
import { Badge, Button, Card, PageHeader } from "@/components/ui/primitives";
import { FieldObservationForm } from "@/components/field-observation-form";
import { InterviewTranscriptViewer } from "@/components/interview-transcript-viewer";
import { parseTranscript } from "@/lib/transcript-parser";
import { getSignedUrl, INTERVIEW_BUCKET } from "@/lib/supabase-storage";
import { deleteFieldObservation, renameObservationSpeaker, updateFieldObservation } from "../../../observation-actions";

export default async function ObservationDetailPage({
  params,
}: {
  params: Promise<{ id: string; obsId: string }>;
}) {
  const { id, obsId } = await params;
  const { project, role } = await getPageContext();
  const [obs] = await db.select().from(fieldObservations).where(eq(fieldObservations.id, obsId)).limit(1);
  if (!obs || obs.projectId !== project.id || obs.experimentId !== id) notFound();
  const [exp] = await db.select().from(experiments).where(eq(experiments.id, id)).limit(1);
  if (!exp) notFound();

  const canEdit = role !== "viewer";
  const segments = obs.transcriptSegments ?? parseTranscript(obs.transcript);

  let audioUrl: string | null = null;
  let audioError = "";
  if (obs.audioPath) {
    try {
      audioUrl = await getSignedUrl(INTERVIEW_BUCKET, obs.audioPath, 60 * 60 * 6);
    } catch (e) {
      audioError = e instanceof Error ? e.message : "Não foi possível carregar a gravação.";
    }
  }
  const hasRecording = !!obs.audioPath || segments.length > 0;

  const meta: [string, string | null][] = [
    ["Laboratório / unidade", obs.site],
    ["Setor observado", obs.area],
    ["Pessoa", obs.personName],
    ["Cargo / função", obs.personRole],
    ["Data", new Date(obs.observedAt).toLocaleDateString("pt-BR")],
  ];

  return (
    <div className="max-w-5xl space-y-4">
      <Card>
        <PageHeader
          title={obs.title}
          actions={<Badge color={hasRecording ? "indigo" : "amber"}>{hasRecording ? "com gravação" : "só anotações"}</Badge>}
          description="Observação em campo (imersão) — não é entrevista qualitativa."
        />
        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          {meta.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-slate-500">{label}</dt>
              <dd className="text-slate-800">{value || "—"}</dd>
            </div>
          ))}
        </dl>
        {obs.systemsUsed && (
          <div className="mt-3 text-sm">
            <p className="text-xs text-slate-500">Sistemas e ferramentas</p>
            <p className="whitespace-pre-wrap text-slate-800">{obs.systemsUsed}</p>
          </div>
        )}
      </Card>

      {obs.notes && (
        <Card>
          <p className="mb-1 text-sm font-semibold text-slate-700">Anotações de campo</p>
          <p className="whitespace-pre-wrap text-sm text-slate-700">{obs.notes}</p>
        </Card>
      )}

      {hasRecording && (
        <div>
          <p className="mb-2 text-sm font-semibold text-slate-700">Transcrição e gravação</p>
          {audioError && <p className="mb-2 text-xs text-amber-700">Gravação indisponível: {audioError}</p>}
          <InterviewTranscriptViewer
            segments={segments}
            audioUrl={audioUrl}
            intervieweeName={obs.personName}
            renameSpeakerAction={canEdit ? renameObservationSpeaker.bind(null, obsId) : undefined}
          />
        </div>
      )}

      {canEdit && (
        <Card>
          <details>
            <summary className="cursor-pointer text-sm font-semibold text-slate-700">
              Editar registro, anexar gravação ou transcrição
            </summary>
            <div className="mt-3">
              <FieldObservationForm
                action={updateFieldObservation.bind(null, obsId)}
                submitLabel="Salvar alterações"
                values={{
                  title: obs.title,
                  site: obs.site,
                  area: obs.area,
                  personName: obs.personName,
                  personRole: obs.personRole,
                  observedAt: obs.observedAt,
                  systemsUsed: obs.systemsUsed,
                  notes: obs.notes,
                  transcript: obs.transcript,
                  hasAudio: !!obs.audioPath,
                }}
              />
            </div>
          </details>
        </Card>
      )}

      <div className="flex items-center justify-between">
        <Link href={`/experiments/${id}`} className="text-sm font-medium text-indigo-600">
          ← Voltar para o experimento
        </Link>
        {role !== "viewer" && (
          <form action={deleteFieldObservation.bind(null, obsId)}>
            <Button type="submit" size="sm" variant="secondary">
              Excluir registro
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
