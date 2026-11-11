"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Badge, Card } from "@/components/ui/primitives";
import { Spinner } from "@/components/ui/button";
import {
  reorderOpportunities,
  moveOpportunityToColumn,
  deleteOpportunityFromList,
} from "@/app/(app)/opportunities/actions";

export type OpportunityCardData = {
  id: string;
  title: string;
  hypothesisTitle?: string;
  personaName?: string;
  priorityScore: string | null;
  evidenceConfidence: number;
};

export type OpportunityColumnDef = { value: string; label: string };

// Discovery Board com arrastar e soltar:
//  - soltar dentro da mesma coluna reordena (topo = mais prioritário);
//  - soltar em outra coluna muda o status da oportunidade (mesma regra do
//    botão "Atualizar status") e grava a posição.
// Com "canEdit" falso (viewer) ou na visão "Prioridade" (ordenada pelo score,
// que é calculado) os cards não são arrastáveis.
export function OpportunityBoard({
  columns,
  itemsByStatus,
  canEdit,
  canDelete,
}: {
  columns: OpportunityColumnDef[];
  itemsByStatus: Record<string, OpportunityCardData[]>;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [board, setBoard] = useState(itemsByStatus);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [saving, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function sourceStatusOf(id: string): string | null {
    for (const status of Object.keys(board)) {
      if (board[status].some((i) => i.id === id)) return status;
    }
    return null;
  }

  function handleDelete(item: OpportunityCardData) {
    const ok = window.confirm(
      `Excluir a oportunidade "${item.title}"?\n\n` +
        `Serão APAGADOS junto: o PRD e TODAS as user stories dela.\n` +
        `Se ela já foi enviada ao Azure DevOps, a Feature de lá NÃO é apagada (apague no Azure).\n\n` +
        `Essa ação não pode ser desfeita.`
    );
    if (!ok) return;
    setDeletingId(item.id);
    startTransition(() => {
      deleteOpportunityFromList(item.id)
        .then((res) => {
          if (!res.ok) {
            setMessage(res.error ?? "Não foi possível excluir a oportunidade.");
            return;
          }
          setMessage(null);
          setBoard((prev) => {
            const next: Record<string, OpportunityCardData[]> = {};
            for (const status of Object.keys(prev)) next[status] = prev[status].filter((i) => i.id !== item.id);
            return next;
          });
        })
        .finally(() => setDeletingId(null));
    });
  }

  function handleDrop(targetStatus: string, targetId: string | null) {
    setDragOverKey(null);
    const draggedId = dragId;
    setDragId(null);
    if (!draggedId || !canEdit) return;

    const fromStatus = sourceStatusOf(draggedId);
    if (!fromStatus) return;
    if (fromStatus === targetStatus && draggedId === targetId) return;

    const prevBoard = board;
    setMessage(null);

    if (fromStatus === targetStatus) {
      const col = [...board[targetStatus]];
      const fromIndex = col.findIndex((i) => i.id === draggedId);
      if (fromIndex === -1) return;
      const [moved] = col.splice(fromIndex, 1);
      const toIndex = targetId ? col.findIndex((i) => i.id === targetId) : col.length;
      col.splice(toIndex === -1 ? col.length : toIndex, 0, moved);

      setBoard({ ...board, [targetStatus]: col });
      startTransition(() => {
        reorderOpportunities(col.map((i) => i.id)).catch(() => {
          setBoard(prevBoard);
          setMessage("Não foi possível salvar a nova ordem. Tente de novo.");
        });
      });
      return;
    }

    const movedItem = board[fromStatus].find((i) => i.id === draggedId);
    if (!movedItem) return;
    const newSourceCol = board[fromStatus].filter((i) => i.id !== draggedId);
    const newTargetCol = [...board[targetStatus]];
    const toIndex = targetId ? newTargetCol.findIndex((i) => i.id === targetId) : newTargetCol.length;
    newTargetCol.splice(toIndex === -1 ? newTargetCol.length : toIndex, 0, movedItem);

    setBoard({ ...board, [fromStatus]: newSourceCol, [targetStatus]: newTargetCol });
    startTransition(() => {
      moveOpportunityToColumn(draggedId, targetStatus, newTargetCol.map((i) => i.id)).catch(() => {
        setBoard(prevBoard);
        setMessage("Não foi possível mover a oportunidade. Tente de novo.");
      });
    });
  }

  return (
    <div>
      <div className="mb-2 flex min-h-5 items-center gap-2 text-xs">
        {saving && (
          <span className="flex items-center gap-1 text-slate-500">
            <Spinner /> salvando…
          </span>
        )}
        {message && <span className="rounded bg-red-50 px-2 py-1 text-red-700">{message}</span>}
        {canEdit && !saving && !message && (
          <span className="text-slate-400">Arraste os cards para mudar a ordem ou a coluna.</span>
        )}
      </div>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map((col) => {
          const items = board[col.value] ?? [];
          return (
            <div
              key={col.value}
              onDragOver={(e) => canEdit && e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleDrop(col.value, null);
              }}
              className="w-72 shrink-0 rounded-xl bg-slate-100/60 p-2"
            >
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{col.label}</span>
                <span className="text-xs text-slate-400">{items.length}</span>
              </div>
              <div className="min-h-[40px] space-y-2">
                {items.map((o) => {
                  const key = `${col.value}:${o.id}`;
                  return (
                    <div
                      key={o.id}
                      draggable={canEdit}
                      onDragStart={() => setDragId(o.id)}
                      onDragOver={(e) => {
                        if (!canEdit) return;
                        e.preventDefault();
                        e.stopPropagation();
                        if (dragOverKey !== key) setDragOverKey(key);
                      }}
                      onDragLeave={() => setDragOverKey((cur) => (cur === key ? null : cur))}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleDrop(col.value, o.id);
                      }}
                      onDragEnd={() => {
                        setDragId(null);
                        setDragOverKey(null);
                      }}
                      className={`relative ${dragOverKey === key ? "rounded-xl ring-2 ring-indigo-300" : ""}`}
                    >
                      <Link href={`/opportunities/${o.id}`} draggable={false}>
                        <Card
                          className={`select-none hover:shadow-md ${canEdit ? "cursor-grab active:cursor-grabbing" : ""} ${
                            dragId === o.id ? "opacity-40" : ""
                          }`}
                        >
                          <p className="text-sm font-medium text-slate-900">{o.title}</p>
                          {o.hypothesisTitle && <p className="mt-1 text-xs text-slate-400">Hipótese: {o.hypothesisTitle}</p>}
                          {o.personaName && <Badge color="indigo">{o.personaName}</Badge>}
                          <div className="mt-2 flex items-center justify-between">
                            <span className="text-xs font-semibold text-slate-700">Score: {o.priorityScore ?? "—"}</span>
                            <span className="text-xs text-slate-400">Evidência: {o.evidenceConfidence}%</span>
                          </div>
                          {canDelete && <div className="h-4" />}
                        </Card>
                      </Link>
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => handleDelete(o)}
                          disabled={deletingId === o.id}
                          className="absolute bottom-3 right-4 text-xs font-medium text-red-500 hover:text-red-700 hover:underline disabled:cursor-wait disabled:opacity-60 disabled:no-underline"
                        >
                          {deletingId === o.id ? "excluindo…" : "excluir"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
