import { notFound } from "next/navigation";
import { db } from "@/db";
import { surveys, surveyQuestions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { submitSurveyResponse } from "@/app/(app)/research/surveys/actions";
import { closeSurveyIfWindowExpired, evaluateSurveyAvailability } from "@/lib/survey-window";

const UNAVAILABLE_MESSAGE: Record<string, { title: string; description: string }> = {
  not_published: {
    title: "Pesquisa não disponível",
    description: "Este link ainda não está aberto para respostas.",
  },
  not_started: {
    title: "Pesquisa ainda não começou",
    description: "Este link vai abrir para respostas em breve. Tente novamente mais perto da data de início.",
  },
  ended: {
    title: "Pesquisa encerrada",
    description: "O prazo de coleta desta pesquisa já terminou e ela não está mais recebendo respostas.",
  },
  manually_closed: {
    title: "Pesquisa encerrada",
    description: "Esta pesquisa não está mais disponível e não está recebendo respostas.",
  },
};

function QuestionInput({ q }: { q: typeof surveyQuestions.$inferSelect }) {
  const name = `q_${q.id}`;
  if (q.questionType === "likert" || q.questionType === "purchase_intent") {
    return (
      <div className="flex gap-3">
        {[1, 2, 3, 4, 5].map((v) => (
          <label key={v} className="flex flex-col items-center text-xs text-slate-500">
            <input type="radio" name={name} value={v} required />
            {v}
          </label>
        ))}
      </div>
    );
  }
  if (q.questionType === "nps") {
    return (
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 11 }, (_, v) => (
          <label key={v} className="flex flex-col items-center text-xs text-slate-500">
            <input type="radio" name={name} value={v} required />
            {v}
          </label>
        ))}
      </div>
    );
  }
  const options = (q.options as string[]) ?? [];
  if (q.questionType === "matrix") {
    const rows = (q.matrixRows as string[]) ?? [];
    if (rows.length === 0 || options.length === 0) {
      return (
        <p className="text-xs text-amber-600">
          Esta pergunta de matriz ainda não tem linhas e/ou colunas configuradas.
        </p>
      );
    }
    return (
      <div className="overflow-x-auto">
        <table className="w-full min-w-max text-sm">
          <thead>
            <tr>
              <th className="pb-2 pr-4 text-left text-xs font-medium text-slate-500">Atividade</th>
              {options.map((c) => (
                <th key={c} className="px-2 pb-2 text-center text-xs font-medium text-slate-500">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri} className="border-t border-slate-100">
                <td className="py-2 pr-4 text-slate-700">{r}</td>
                {options.map((c) => (
                  <td key={c} className="px-2 py-2 text-center">
                    <input type="checkbox" name={`${name}__row_${ri}`} value={c} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (q.questionType === "multi_choice") {
    return (
      <div className="space-y-1">
        {options.map((o) => (
          <label key={o} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name={name} value={o} /> {o}
          </label>
        ))}
      </div>
    );
  }
  if (["single_choice", "demographic", "frequency"].includes(q.questionType) && options.length > 0) {
    return (
      <div className="space-y-1">
        {options.map((o) => (
          <label key={o} className="flex items-center gap-2 text-sm">
            <input type="radio" name={name} value={o} required /> {o}
          </label>
        ))}
      </div>
    );
  }
  if (q.questionType === "open_text") {
    return <input type="text" name={name} className="w-full rounded-md border border-slate-300 p-2 text-sm" />;
  }
  return <textarea name={name} rows={3} className="w-full rounded-md border border-slate-300 p-2 text-sm" />;
}

export default async function PublicSurveyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [surveyRow] = await db.select().from(surveys).where(eq(surveys.publicSlug, slug)).limit(1);
  if (!surveyRow) notFound();

  // Se o prazo de término já passou, finaliza de fato agora (ver
  // src/lib/survey-window.ts) — assim o status gravado não fica "published"
  // pra sempre só porque ninguém abriu a tela interna depois do prazo.
  const survey = await closeSurveyIfWindowExpired(surveyRow);
  const availability = evaluateSurveyAvailability(survey);

  if (!availability.open) {
    const msg = UNAVAILABLE_MESSAGE[availability.reason] ?? UNAVAILABLE_MESSAGE.not_published;
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <h1 className="text-xl font-semibold text-slate-900">{msg.title}</h1>
        <p className="mt-2 text-sm text-slate-500">{msg.description}</p>
      </div>
    );
  }

  const questions = await db
    .select()
    .from(surveyQuestions)
    .where(eq(surveyQuestions.surveyId, survey.id))
    .orderBy(surveyQuestions.orderIndex);

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <h1 className="text-xl font-semibold text-slate-900">{survey.title}</h1>
      {survey.objective && <p className="mt-1 text-sm text-slate-500">{survey.objective}</p>}
      <form action={submitSurveyResponse.bind(null, slug)} className="mt-6 space-y-6">
        {questions.map((q, idx) => (
          <div key={q.id}>
            <p className="mb-2 text-sm font-medium text-slate-800">
              {idx + 1}. {q.questionText}
            </p>
            <QuestionInput q={q} />
          </div>
        ))}
        <button type="submit" className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
          Enviar respostas
        </button>
      </form>
    </div>
  );
}
