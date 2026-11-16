"use client";

import { useState, useTransition } from "react";
import { Button, Input } from "@/components/ui/primitives";
import { ProgressBar } from "@/components/progress-bar";
import { addGoal, removeGoal, renameGoal, toggleGoal, type GoalResult } from "./actions";

// Objetivos do PRD como checklist: marcar/desmarcar, editar, remover e
// adicionar salvam na hora. O percentual vem de (concluídos / total).
export function GoalsChecklist({
  opportunityId,
  initialGoals,
  initialDone,
  canEdit,
}: {
  opportunityId: string;
  initialGoals: string[];
  initialDone: string[];
  canEdit: boolean;
}) {
  const [goals, setGoals] = useState(initialGoals);
  const [done, setDone] = useState(() => new Set(initialDone));
  // Se o servidor mandar dados diferentes (ex.: "Gerar novo rascunho"), acompanha; o eco das
  // nossas próprias ações é igual ao estado local e não muda nada.
  const sig = JSON.stringify([initialGoals, initialDone]);
  const [lastSig, setLastSig] = useState(sig);
  if (sig !== lastSig) {
    setLastSig(sig);
    setGoals(initialGoals);
    setDone(new Set(initialDone));
  }
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [newText, setNewText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const doneCount = goals.filter((g) => done.has(g)).length;
  const percent = goals.length === 0 ? 0 : Math.round((doneCount / goals.length) * 100);

  function run(action: Promise<GoalResult>, rollback: () => void) {
    startTransition(async () => {
      const res = await action;
      if (!res.ok) {
        rollback();
        setError(res.error);
      } else {
        setError(null);
      }
    });
  }

  function onToggle(g: string, checked: boolean) {
    const prev = new Set(done);
    const next = new Set(done);
    if (checked) next.add(g);
    else next.delete(g);
    setDone(next);
    run(toggleGoal(opportunityId, g, checked), () => setDone(prev));
  }

  function onAdd() {
    const t = newText.trim();
    if (!t) return;
    if (goals.includes(t)) {
      setError("Esse objetivo já está na lista.");
      return;
    }
    const prev = goals;
    setGoals([...goals, t]);
    setNewText("");
    run(addGoal(opportunityId, t), () => setGoals(prev));
  }

  function onSaveEdit(old: string) {
    const t = draft.trim();
    setEditing(null);
    if (!t || t === old) return;
    if (goals.includes(t)) {
      setError("Esse objetivo já está na lista.");
      return;
    }
    const prevGoals = goals;
    const prevDone = new Set(done);
    setGoals(goals.map((g) => (g === old ? t : g)));
    if (done.has(old)) {
      const next = new Set(done);
      next.delete(old);
      next.add(t);
      setDone(next);
    }
    run(renameGoal(opportunityId, old, t), () => {
      setGoals(prevGoals);
      setDone(prevDone);
    });
  }

  function onRemove(g: string) {
    const prevGoals = goals;
    const prevDone = new Set(done);
    setGoals(goals.filter((x) => x !== g));
    const next = new Set(done);
    next.delete(g);
    setDone(next);
    run(removeGoal(opportunityId, g), () => {
      setGoals(prevGoals);
      setDone(prevDone);
    });
  }

  return (
    <div>
      <div className="mb-2 flex items-end justify-between gap-3">
        <p className="text-xs font-medium text-slate-600">Objetivos (checklist)</p>
        <p className="text-xs text-slate-500">
          {goals.length === 0 ? "Sem objetivos ainda" : `${doneCount} de ${goals.length} · `}
          {goals.length > 0 && <strong className={percent >= 100 ? "text-emerald-600" : "text-slate-800"}>{percent}%</strong>}
        </p>
      </div>
      {goals.length > 0 && <ProgressBar percent={percent} className="mb-3" />}

      {goals.length > 0 && (
        <ul className="mb-3 space-y-1">
          {goals.map((g) => {
            const isDone = done.has(g);
            return (
              <li key={g} className="group flex items-start gap-2 rounded-md px-1 py-1 hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={isDone}
                  disabled={!canEdit}
                  onChange={(e) => onToggle(g, e.target.checked)}
                  className="mt-1 h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:cursor-default"
                  aria-label={`Concluir: ${g}`}
                />
                {editing === g ? (
                  <div className="flex flex-1 items-center gap-2">
                    <Input
                      autoFocus
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          onSaveEdit(g);
                        }
                        if (e.key === "Escape") setEditing(null);
                      }}
                    />
                    <Button type="button" size="sm" onClick={() => onSaveEdit(g)}>
                      OK
                    </Button>
                  </div>
                ) : (
                  <>
                    <span className={`flex-1 text-sm leading-snug ${isDone ? "text-slate-400 line-through" : "text-slate-800"}`}>
                      {g}
                    </span>
                    {canEdit && (
                      <span className="flex shrink-0 gap-2 text-xs opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                        <button
                          type="button"
                          className="text-indigo-600 hover:underline"
                          onClick={() => {
                            setEditing(g);
                            setDraft(g);
                          }}
                        >
                          editar
                        </button>
                        <button type="button" className="text-red-500 hover:underline" onClick={() => onRemove(g)}>
                          remover
                        </button>
                      </span>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {canEdit && (
        <div className="flex items-center gap-2">
          <Input
            value={newText}
            placeholder="Novo objetivo (Enter para adicionar)"
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onAdd();
              }
            }}
          />
          <Button type="button" size="sm" variant="secondary" onClick={onAdd}>
            + Adicionar
          </Button>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
