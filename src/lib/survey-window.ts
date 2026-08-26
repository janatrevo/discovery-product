import { db } from "@/db";
import { surveys } from "@/db/schema";
import { eq } from "drizzle-orm";

export type SurveyAvailability =
  | { open: true }
  | { open: false; reason: "not_published" | "manually_closed" | "not_started" | "ended" };

// Mesma checagem usada tanto no link público (src/app/s/[slug]/page.tsx e
// submitSurveyResponse) quanto na tela interna do survey — pra "published"
// na tela interna sempre bater com o que o link público de fato aceita.
export function evaluateSurveyAvailability(survey: {
  status: string;
  startDate: Date | string | null;
  endDate: Date | string | null;
}): SurveyAvailability {
  if (survey.status === "closed") return { open: false, reason: "manually_closed" };
  if (survey.status !== "published") return { open: false, reason: "not_published" };
  const now = new Date();
  if (survey.startDate && now < new Date(survey.startDate)) return { open: false, reason: "not_started" };
  if (survey.endDate && now > new Date(survey.endDate)) return { open: false, reason: "ended" };
  return { open: true };
}

// Chamado sempre que alguém abre o survey (link público ou tela interna do
// projeto) — se a data de término já passou e o status ainda está
// "published", finaliza de fato no banco. Sem isso, "ended" seria só um
// cálculo feito na hora de exibir a página — nunca gravado — e o board
// interno (research/surveys) continuaria mostrando "published" pra sempre,
// mesmo com a coleta encerrada pelo prazo.
export async function closeSurveyIfWindowExpired<
  T extends { id: string; status: string; endDate: Date | string | null },
>(survey: T): Promise<T> {
  if (survey.status !== "published" || !survey.endDate) return survey;
  if (new Date() <= new Date(survey.endDate)) return survey;
  await db.update(surveys).set({ status: "closed" }).where(eq(surveys.id, survey.id));
  return { ...survey, status: "closed" };
}
