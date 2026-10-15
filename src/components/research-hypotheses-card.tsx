import Link from "next/link";
import { db } from "@/db";
import { hypotheses } from "@/db/schema";
import { eq } from "drizzle-orm";
import { Button, Card, Select } from "@/components/ui/primitives";
import { hypothesesForSurvey, hypothesesForGuide } from "@/lib/research-links";
import {
  linkSurveyToHypothesis,
  unlinkSurveyFromHypothesis,
  linkGuideToHypothesis,
  unlinkGuideFromHypothesis,
} from "@/app/(app)/research/link-actions";

// "Hipóteses que esta pesquisa responde" — usado nas telas do survey e do
// roteiro de entrevista. A mesma pesquisa pode responder várias hipóteses.
export async function ResearchHypothesesCard({
  kind,
  researchId,
  projectId,
  canEdit,
}: {
  kind: "survey" | "guide";
  researchId: string;
  projectId: string;
  canEdit: boolean;
}) {
  const [linked, all] = await Promise.all([
    kind === "survey" ? hypothesesForSurvey(researchId) : hypothesesForGuide(researchId),
    db.select().from(hypotheses).where(eq(hypotheses.projectId, projectId)),
  ]);
  const linkedIds = new Set(linked.map((h) => h.id));
  const available = all.filter((h) => !linkedIds.has(h.id));

  const linkAction = kind === "survey" ? linkSurveyToHypothesis : linkGuideToHypothesis;
  const unlinkAction = kind === "survey" ? unlinkSurveyFromHypothesis : unlinkGuideFromHypothesis;
  const idField = kind === "survey" ? "surveyId" : "guideId";
  const noun = kind === "survey" ? "survey" : "roteiro";

  return (
    <Card>
      <p className="mb-1 text-sm font-semibold text-slate-700">Hipóteses que esta pesquisa responde</p>
      <p className="mb-2 text-xs text-slate-500">
        O mesmo {noun} pode responder mais de uma hipótese. Ele aparece na aba &quot;Pesquisa&quot; de cada uma delas.
      </p>

      {linked.length === 0 ? (
        <p className="text-sm text-slate-400">Nenhuma hipótese vinculada ainda.</p>
      ) : (
        <ul className="space-y-1">
          {linked.map((h) => (
            <li key={h.id} className="flex items-center justify-between gap-2 text-sm">
              <Link href={`/hypotheses/${h.id}`} className="text-indigo-700 hover:underline">
                {h.title}
              </Link>
              <span className="flex items-center gap-3">
                <Link href={`/hypotheses/${h.id}?tab=research`} className="text-xs font-medium text-indigo-600 hover:underline">
                  Analisar com IA
                </Link>
              {canEdit && (
                <form action={unlinkAction}>
                  <input type="hidden" name={idField} value={researchId} />
                  <input type="hidden" name="hypothesisId" value={h.id} />
                  <button type="submit" className="text-xs text-red-500 hover:underline">
                    desvincular
                  </button>
                </form>
              )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {canEdit && available.length > 0 && (
        <form action={linkAction} className="mt-3 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
          <input type="hidden" name={idField} value={researchId} />
          <Select name="hypothesisId" defaultValue="" required className="max-w-md">
            <option value="">Vincular a outra hipótese...</option>
            {available.map((h) => (
              <option key={h.id} value={h.id}>
                {h.title}
              </option>
            ))}
          </Select>
          <Button type="submit" size="sm" variant="secondary">
            Vincular
          </Button>
        </form>
      )}
    </Card>
  );
}
