import { notFound } from "next/navigation";
import { db } from "@/db";
import { surveys, surveyQuestions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { submitSurveyResponse } from "@/app/(app)/research/surveys/actions";

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
  return <textarea name={name} rows={3} className="w-full rounded-md border border-slate-300 p-2 text-sm" />;
}

export default async function PublicSurveyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [survey] = await db.select().from(surveys).where(eq(surveys.publicSlug, slug)).limit(1);
  if (!survey || survey.status !== "published") notFound();

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
