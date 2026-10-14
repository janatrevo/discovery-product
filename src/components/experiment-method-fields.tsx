"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Field, Input, Label, Select, Textarea } from "@/components/ui/primitives";

// Sugestões que cada pesquisa existente "empresta" ao experimento. São
// calculadas no servidor (ver experiments/new/page.tsx) a partir do que a
// própria pesquisa já tem: objetivo, público-alvo, meta de respostas,
// entrevistas realizadas (e suas personas) e o resultado esperado do roteiro.
export type ResearchSuggestion = {
  objective?: string;
  expected?: string;
  sample?: number;
  sampleWhy?: string;
  personaId?: string;
  personaWhy?: string;
};

type ResearchOption = {
  id: string;
  title: string;
  detail: string;
  linked: boolean;
  suggest: ResearchSuggestion;
};

type PersonaOption = { id: string; label: string };

type FieldKey = "objective" | "personaId" | "samplePlanned" | "resultExpected";

// Junta o que as pesquisas escolhidas sugerem: objetivos e resultados
// esperados diferentes viram linhas separadas; a persona é a que mais aparece
// entre elas; a amostra é a soma das amostras.
function suggestFor(chosen: ResearchOption[], personaIds: Set<string>) {
  const uniq = (xs: (string | undefined)[]) =>
    Array.from(new Set(xs.map((x) => (x ?? "").trim()).filter(Boolean))).join("\n");

  const votes = new Map<string, number>();
  for (const o of chosen) {
    const pid = o.suggest.personaId;
    if (pid && personaIds.has(pid)) votes.set(pid, (votes.get(pid) ?? 0) + 1);
  }
  let personaId = "";
  let top = 0;
  for (const [pid, n] of votes) {
    if (n > top) {
      personaId = pid;
      top = n;
    }
  }
  const personaWhy = chosen.find((o) => o.suggest.personaId === personaId)?.suggest.personaWhy;

  const samples = chosen.map((o) => o.suggest.sample).filter((n): n is number => typeof n === "number" && n > 0);
  const sample = samples.length ? samples.reduce((a, b) => a + b, 0) : 0;
  const sampleWhy = chosen.find((o) => o.suggest.sampleWhy)?.suggest.sampleWhy;

  const values: Record<FieldKey, string> = {
    objective: uniq(chosen.map((o) => o.suggest.objective)),
    personaId,
    samplePlanned: sample ? String(sample) : "",
    resultExpected: uniq(chosen.map((o) => o.suggest.expected)),
  };

  const reasons: string[] = [];
  if (values.objective) reasons.push("objetivo");
  if (values.personaId) reasons.push(`persona${personaWhy ? ` (${personaWhy})` : ""}`);
  if (values.samplePlanned) reasons.push(`amostra planejada${sampleWhy ? ` (${sampleWhy})` : ""}`);
  if (values.resultExpected) reasons.push("resultado esperado");
  return { values, reasons };
}

// Formulário de experimento. Quando o método é Survey ou Entrevista, a pessoa
// escolhe pesquisas que JÁ EXISTEM (a mesma pesquisa serve a vários
// experimentos e hipóteses) e o formulário se preenche sozinho com o que as
// pesquisas escolhidas informam. Tudo continua editável: o que a pessoa mexer
// à mão deixa de ser sobrescrito.
export function ExperimentMethodFields({
  methods,
  defaultMethod,
  surveys,
  guides,
  personas,
  hypothesisId,
}: {
  methods: { value: string; label: string }[];
  defaultMethod: string;
  surveys: ResearchOption[];
  guides: ResearchOption[];
  personas: PersonaOption[];
  hypothesisId: string;
}) {
  const [method, setMethod] = useState(defaultMethod);
  const [selectedSurveys, setSelectedSurveys] = useState<string[]>([]);
  const [selectedGuides, setSelectedGuides] = useState<string[]>([]);

  const [values, setValues] = useState<Record<FieldKey, string>>({
    objective: "",
    personaId: "",
    samplePlanned: "",
    resultExpected: "",
  });
  const [touched, setTouched] = useState<Set<FieldKey>>(new Set());

  const isSurvey = method === "survey";
  const isInterview = method === "interview";
  const options = isSurvey ? surveys : isInterview ? guides : [];
  const selectedIds = isSurvey ? selectedSurveys : isInterview ? selectedGuides : [];
  const fieldName = isSurvey ? "surveyIds" : "guideIds";
  const noun = isSurvey ? "survey" : "roteiro de entrevista";
  const newHref = isSurvey
    ? `/research/surveys/new?hypothesisId=${hypothesisId}`
    : `/research/interviews/new?hypothesisId=${hypothesisId}`;

  const personaIds = useMemo(() => new Set(personas.map((p) => p.id)), [personas]);

  // O que as pesquisas marcadas sugerem para cada campo.
  const { values: auto, reasons } = useMemo(
    () => suggestFor(options.filter((o) => selectedIds.includes(o.id)), personaIds),
    [options, selectedIds, personaIds]
  );

  // Preenche os campos que a pessoa ainda não editou.
  function applyAuto(nextAuto: Record<FieldKey, string>, keepTouched: Set<FieldKey>) {
    setValues((prev) => {
      const next = { ...prev };
      (Object.keys(nextAuto) as FieldKey[]).forEach((k) => {
        if (!keepTouched.has(k)) next[k] = nextAuto[k];
      });
      return next;
    });
  }

  function computeAuto(nextSelected: string[], list: ResearchOption[]) {
    return suggestFor(list.filter((o) => nextSelected.includes(o.id)), personaIds).values;
  }

  function toggle(id: string, checked: boolean) {
    const current = isSurvey ? selectedSurveys : selectedGuides;
    const next = checked ? [...current, id] : current.filter((x) => x !== id);
    if (isSurvey) setSelectedSurveys(next);
    else setSelectedGuides(next);
    applyAuto(computeAuto(next, options), touched);
  }

  function changeMethod(next: string) {
    setMethod(next);
    // Cada método tem sua própria seleção; ao trocar, recalcula com a dele.
    const list = next === "survey" ? surveys : next === "interview" ? guides : [];
    const sel = next === "survey" ? selectedSurveys : next === "interview" ? selectedGuides : [];
    applyAuto(computeAuto(sel, list), touched);
  }

  function edit(key: FieldKey, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setTouched((prev) => new Set(prev).add(key));
  }

  function reapply() {
    setTouched(new Set());
    applyAuto(auto, new Set());
  }

  const isAuto = (k: FieldKey) => !touched.has(k) && auto[k] !== "" && values[k] === auto[k];

  return (
    <>
      <Field>
        <Label>Método</Label>
        <Select name="method" value={method} onChange={(e) => changeMethod(e.target.value)}>
          {methods.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </Select>
      </Field>

      {(isSurvey || isInterview) && (
        <div className="mb-3 rounded-md border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-medium text-slate-700">
            Usar {isSurvey ? "surveys" : "roteiros de entrevista"} que já existem
          </p>
          <p className="mb-2 text-xs text-slate-500">
            Marque um ou mais em vez de criar {isSurvey ? "um survey novo" : "um roteiro novo"}. Eles também passam a
            responder esta hipótese, e o formulário abaixo se preenche com o que a pesquisa já sabe.
          </p>
          {options.length === 0 ? (
            <p className="text-xs text-slate-400">
              Ainda não há {noun} cadastrado.{" "}
              <Link href={newHref} className="font-medium text-indigo-600">
                Criar o primeiro
              </Link>
            </p>
          ) : (
            <ul className="max-h-48 space-y-1 overflow-y-auto">
              {options.map((o) => (
                <li key={o.id}>
                  <label className="flex items-start gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      name={fieldName}
                      value={o.id}
                      checked={selectedIds.includes(o.id)}
                      onChange={(e) => toggle(o.id, e.target.checked)}
                      className="mt-1"
                    />
                    <span>
                      {o.title}
                      <span className="ml-2 text-xs text-slate-400">
                        {o.detail}
                        {o.linked ? " · já vinculado a esta hipótese" : ""}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {options.length > 0 && (
            <p className="mt-2 text-xs text-slate-500">
              Precisa de uma nova?{" "}
              <Link href={newHref} className="font-medium text-indigo-600">
                Criar {isSurvey ? "survey" : "roteiro"}
              </Link>
            </p>
          )}
          {selectedIds.length > 0 && (
            <div className="mt-2 rounded-md bg-indigo-50 px-3 py-2 text-xs text-indigo-900">
              {reasons.length > 0 ? (
                <>
                  Preenchido a partir da pesquisa: {reasons.join(", ")}. Revise e edite à vontade.{" "}
                  {touched.size > 0 && (
                    <button type="button" onClick={reapply} className="font-medium underline">
                      Refazer sugestões
                    </button>
                  )}
                </>
              ) : (
                <>Essa pesquisa ainda não tem objetivo, público ou entrevistas cadastrados para sugerir campos.</>
              )}
            </div>
          )}
        </div>
      )}

      <Field>
        <Label>Objetivo{isAuto("objective") ? " · sugerido pela pesquisa" : ""}</Label>
        <Textarea
          name="objective"
          rows={2}
          value={values.objective}
          onChange={(e) => edit("objective", e.target.value)}
        />
      </Field>
      <Field>
        <Label>Persona{isAuto("personaId") ? " · sugerida pela pesquisa" : ""}</Label>
        <Select name="personaId" value={values.personaId} onChange={(e) => edit("personaId", e.target.value)}>
          <option value="">—</option>
          {personas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field>
        <Label>Variável testada</Label>
        <Input name="variable" />
      </Field>
      <Field>
        <Label>Métrica</Label>
        <Input name="metric" />
      </Field>
      <Field>
        <Label>Amostra planejada{isAuto("samplePlanned") ? " · sugerida pela pesquisa" : ""}</Label>
        <Input
          name="samplePlanned"
          type="number"
          value={values.samplePlanned}
          onChange={(e) => edit("samplePlanned", e.target.value)}
        />
      </Field>
      <Field>
        <Label>Resultado esperado{isAuto("resultExpected") ? " · sugerido pela pesquisa" : ""}</Label>
        <Textarea
          name="resultExpected"
          rows={2}
          value={values.resultExpected}
          onChange={(e) => edit("resultExpected", e.target.value)}
        />
      </Field>
    </>
  );
}
