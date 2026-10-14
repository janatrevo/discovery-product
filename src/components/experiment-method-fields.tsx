"use client";

import { useState } from "react";
import Link from "next/link";
import { Field, Label, Select } from "@/components/ui/primitives";

type ResearchOption = { id: string; title: string; detail: string; linked: boolean };

// Método do experimento + seleção de pesquisas que JÁ EXISTEM. Quando o
// método é Survey ou Entrevista, em vez de criar uma pesquisa nova a pessoa
// escolhe uma ou mais já cadastradas (a mesma pesquisa pode servir a vários
// experimentos e hipóteses).
export function ExperimentMethodFields({
  methods,
  defaultMethod,
  surveys,
  guides,
  hypothesisId,
}: {
  methods: { value: string; label: string }[];
  defaultMethod: string;
  surveys: ResearchOption[];
  guides: ResearchOption[];
  hypothesisId: string;
}) {
  const [method, setMethod] = useState(defaultMethod);

  const isSurvey = method === "survey";
  const isInterview = method === "interview";
  const options = isSurvey ? surveys : isInterview ? guides : [];
  const fieldName = isSurvey ? "surveyIds" : "guideIds";
  const noun = isSurvey ? "survey" : "roteiro de entrevista";
  const newHref = isSurvey
    ? `/research/surveys/new?hypothesisId=${hypothesisId}`
    : `/research/interviews/new?hypothesisId=${hypothesisId}`;

  return (
    <>
      <Field>
        <Label>Método</Label>
        <Select name="method" value={method} onChange={(e) => setMethod(e.target.value)}>
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
            responder esta hipótese.
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
                    <input type="checkbox" name={fieldName} value={o.id} className="mt-1" />
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
        </div>
      )}
    </>
  );
}
