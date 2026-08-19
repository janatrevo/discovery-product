"use server";

import { db } from "@/db";
import {
  interviewGuides,
  interviewGuideQuestions,
  interviews,
  codes,
  codedSegments,
  evidence,
  hypothesisEvidence,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getPageContext } from "@/lib/page-context";
import { linesToArray } from "@/lib/list-utils";
import { suggestCodes } from "@/lib/ai";
import { recomputeHypothesis } from "@/lib/recompute-hypothesis";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

// Usado a partir da tela de Persona quando uma Entrevista é uma das razões
// que bloqueiam a exclusão (ver checkPersonaDeletable) — desvincula sem
// apagar a entrevista (ela continua no roteiro original, só solta a
// persona).
export async function unlinkPersonaFromInterview(interviewId: string, personaId: string) {
  const { role } = await getPageContext();
  if (role !== "owner" && role !== "editor") throw new Error("Sem permissão.");
  await db.update(interviews).set({ personaId: null }).where(eq(interviews.id, interviewId));
  revalidatePath("/research/interviews", "layout");
  revalidatePath(`/personas/${personaId}`);
}

// Usado a partir da tela de Hipótese quando um roteiro de entrevista é uma
// das razões que bloqueiam a exclusão (ver checkHypothesisDeletable) —
// desvincula sem apagar o roteiro (ele continua em Research & Testing, só
// solta a hipótese).
export async function unlinkHypothesisFromGuide(guideId: string, hypothesisId: string) {
  const { role } = await getPageContext();
  if (role !== "owner" && role !== "editor") throw new Error("Sem permissão.");
  await db.update(interviewGuides).set({ hypothesisId: null }).where(eq(interviewGuides.id, guideId));
  revalidatePath(`/research/interviews/${guideId}`);
  revalidatePath(`/hypotheses/${hypothesisId}`);
}

export async function createGuide(formData: FormData) {
  const { user, project, role } = await getPageContext();
  if (role === "viewer") throw new Error("Sem permissão.");
  const hypothesisId = String(formData.get("hypothesisId") || "") || null;

  const [guide] = await db
    .insert(interviewGuides)
    .values({
      projectId: project.id,
      hypothesisId,
      title: String(formData.get("title") || ""),
      objective: String(formData.get("objective") || ""),
      scenario: String(formData.get("scenario") || ""),
      jtbdContext: String(formData.get("jtbdContext") || ""),
      jtbdMotivation: String(formData.get("jtbdMotivation") || ""),
      jtbdObstacle: String(formData.get("jtbdObstacle") || ""),
      jtbdExpectedOutcome: String(formData.get("jtbdExpectedOutcome") || ""),
      createdBy: user.id,
    })
    .returning();

  const questionLines = linesToArray(formData.get("questions"));
  if (questionLines.length) {
    await db.insert(interviewGuideQuestions).values(
      questionLines.map((q, idx) => ({ guideId: guide.id, orderIndex: idx, questionText: q }))
    );
  }

  revalidatePath("/research/interviews");
  redirect(`/research/interviews/${guide.id}`);
}

export async function logInterview(guideId: string, formData: FormData) {
  const { user, project, role } = await getPageContext();
  if (role === "viewer") throw new Error("Sem permissão.");

  const [interview] = await db
    .insert(interviews)
    .values({
      projectId: project.id,
      guideId,
      personaId: String(formData.get("personaId") || "") || null,
      intervieweeRef: String(formData.get("intervieweeRef") || ""),
      transcript: String(formData.get("transcript") || ""),
      createdBy: user.id,
    })
    .returning();

  revalidatePath(`/research/interviews/${guideId}`);
  redirect(`/research/interviews/${guideId}/interview/${interview.id}`);
}

export async function createCode(projectId: string, name: string) {
  const [existing] = await db.select().from(codes).where(eq(codes.name, name)).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(codes).values({ projectId, name }).returning();
  return created;
}

export async function addCodedSegment(interviewId: string, formData: FormData) {
  const { user, project, role } = await getPageContext();
  if (role === "viewer") throw new Error("Sem permissão.");

  let codeId = String(formData.get("codeId") || "");
  const newCodeName = String(formData.get("newCodeName") || "").trim();
  if (!codeId && newCodeName) {
    const created = await createCode(project.id, newCodeName);
    codeId = created.id;
  }
  if (!codeId) throw new Error("Selecione ou crie um código.");

  await db.insert(codedSegments).values({
    interviewId,
    codeId,
    excerpt: String(formData.get("excerpt") || ""),
    aiSuggested: false,
    confirmed: true,
    isRepresentativeQuote: formData.get("isQuote") === "true",
    createdBy: user.id,
  });
  revalidatePath(`/research/interviews`, "layout");
}

export async function confirmSegment(segmentId: string) {
  const { role } = await getPageContext();
  if (role === "viewer") throw new Error("Sem permissão.");
  await db.update(codedSegments).set({ confirmed: true }).where(eq(codedSegments.id, segmentId));
  revalidatePath(`/research/interviews`, "layout");
}

export async function deleteSegment(segmentId: string) {
  const { role } = await getPageContext();
  if (role === "viewer") throw new Error("Sem permissão.");
  await db.delete(codedSegments).where(eq(codedSegments.id, segmentId));
  revalidatePath(`/research/interviews`, "layout");
}

// Promove os trechos CONFIRMADOS (nunca sugestões de IA ainda não
// confirmadas) de uma entrevista a uma Evidência real, vinculada a uma
// hipótese — sem isso, entrevistas registradas nunca contavam para o
// Confidence Score. Idempotente via evidence.sourceInterviewId.
export async function promoteInterviewToEvidence(interviewId: string, formData: FormData) {
  const { user, project, role } = await getPageContext();
  if (role === "viewer") throw new Error("Sem permissão.");

  const [interview] = await db.select().from(interviews).where(eq(interviews.id, interviewId)).limit(1);
  if (!interview || interview.projectId !== project.id) throw new Error("Entrevista não encontrada.");

  const confirmedSegments = await db
    .select({ seg: codedSegments, code: codes })
    .from(codedSegments)
    .innerJoin(codes, eq(codes.id, codedSegments.codeId))
    .where(and(eq(codedSegments.interviewId, interviewId), eq(codedSegments.confirmed, true)));

  if (confirmedSegments.length === 0) {
    throw new Error("Confirme ao menos um trecho codificado antes de promover esta entrevista a evidência.");
  }

  let hypothesisId = String(formData.get("hypothesisId") || "");
  if (!hypothesisId && interview.guideId) {
    const [guide] = await db.select().from(interviewGuides).where(eq(interviewGuides.id, interview.guideId)).limit(1);
    hypothesisId = guide?.hypothesisId || "";
  }
  if (!hypothesisId) throw new Error("Selecione uma hipótese para vincular esta evidência.");

  const favorable = formData.get("favorable") === "true";

  const content = `Trechos codificados de "${interview.intervieweeRef || "entrevista"}":\n${confirmedSegments
    .map((s) => `[${s.code.name}] "${s.seg.excerpt}"`)
    .join("\n")}`;

  const values = {
    source: `Entrevista: ${interview.intervieweeRef || interviewId.slice(0, 8)}`,
    type: "interview",
    content,
    personaId: interview.personaId,
    sampleSize: 1,
    qualityScore: 75,
    reliabilityScore: 70,
    originClass: "real_data" as const,
    originMethod: "interview",
    generatedBy: "human" as const,
    sourceInterviewId: interviewId,
    evidenceDate: interview.interviewDate,
  };

  const [existing] = await db.select().from(evidence).where(eq(evidence.sourceInterviewId, interviewId)).limit(1);

  if (existing) {
    await db.update(evidence).set(values).where(eq(evidence.id, existing.id));
    const existingLinks = await db
      .select()
      .from(hypothesisEvidence)
      .where(eq(hypothesisEvidence.evidenceId, existing.id));
    if (existingLinks.length) {
      await db.update(hypothesisEvidence).set({ favorable }).where(eq(hypothesisEvidence.evidenceId, existing.id));
      for (const link of existingLinks) await recomputeHypothesis(link.hypothesisId, user.id);
    } else {
      await db.insert(hypothesisEvidence).values({ hypothesisId, evidenceId: existing.id, favorable });
      await recomputeHypothesis(hypothesisId, user.id);
    }
  } else {
    const [created] = await db
      .insert(evidence)
      .values({ ...values, projectId: project.id, createdBy: user.id })
      .returning();
    await db.insert(hypothesisEvidence).values({ hypothesisId, evidenceId: created.id, favorable });
    await recomputeHypothesis(hypothesisId, user.id);
  }

  revalidatePath(`/research/interviews`, "layout");
  revalidatePath(`/hypotheses/${hypothesisId}`);
  revalidatePath("/repository");
}

export async function runAiCodeSuggestion(interviewId: string) {
  const { user, project, role } = await getPageContext();
  if (role === "viewer") throw new Error("Sem permissão.");

  const [interview] = await db.select().from(interviews).where(eq(interviews.id, interviewId)).limit(1);
  if (!interview?.transcript) return;

  const existingCodes = await db.select().from(codes).where(eq(codes.projectId, project.id));
  const { data: suggestions, isMock } = await suggestCodes(interview.transcript, existingCodes.map((c) => c.name));

  for (const s of suggestions) {
    let code = existingCodes.find((c) => c.name.toLowerCase() === s.codeName.toLowerCase());
    if (!code) code = await createCode(project.id, s.codeName);
    await db.insert(codedSegments).values({
      interviewId,
      codeId: code.id,
      excerpt: isMock ? `[SUGESTÃO EM MODO DEMO] ${s.excerpt}` : s.excerpt,
      aiSuggested: true,
      confirmed: false,
      createdBy: user.id,
    });
  }
  revalidatePath(`/research/interviews`, "layout");
}
