"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Badge, Card } from "@/components/ui/primitives";
import { reorderHypotheses, moveHypothesisToColumn } from "@/app/(app)/hypotheses/actions";

type BadgeColor = "slate" | "emerald" | "amber" | "red" | "sky" | "indigo" | "violet";

export type HypothesisCardData = {
  id: string;
  title: string;
  typeLabel: string;
  confidenceScore: number;
  isStale: boolean;
  daysSinceLatest?: number;
  products: { id: string; name: string }[];
};

export type HypothesisColumnDef = {
  status: string;
  label: string;
  color: BadgeColor;
  highlighted: boolean;
};

// Board de hipóteses com drag-and-drop: arrastar pra cima/baixo dentro da
// mesma coluna reordena a fila de prioridade (topo = mais prioritário);
// arrastar pra outra coluna muda o status. Como o status normalmente é
// calculado automaticamente a partir da confiança/evidências (ver
// recompute-hypothesis.ts) e só muda manualmente via override rastreado
// (ver overrideStatus em actions.ts), mover um card pra outra coluna pede
// a mesma justificativa obrigatória — só que via prompt(), no meio do
// gesto de arrastar, em vez de um formulário separado.
export function HypothesisBoard({
  columns,
  itemsByStatus,
}: {
  columns: HypothesisColumnDef[];
  itemsByStatus: Record<string, HypothesisCardData[]>;
}) {
  const [board, setBoard] = useState(itemsByStatus);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function sourceStatusOf(id: string): string | null {
    for (const status of Object.keys(board)) {
      if (board[status].some((i) => i.id === id)) return status;
    }
    return null;
  }

  function handleDrop(targetStatus: string, targetId: string | null) {
    setDragOverKey(null);
    const draggedId = dragId;
    setDragId(null);
    if (!draggedId) return;

    const fromStatus = sourceStatusOf(draggedId);
    if (!fromStatus) return;
    if (fromStatus === targetStatus && draggedId === targetId) return;

    const prevBoard = board;

    if (fromStatus === targetStatus) {
      // Reordenar dentro da mesma coluna — não muda status, só a prioridade.
      const col = [...board[targetStatus]];
      const fromIndex = col.findIndex((i) => i.id === draggedId);
      if (fromIndex === -1) return;
      const [moved] = col.splice(fromIndex, 1);
      const toIndex = targetId ? col.findIndex((i) => i.id === targetId) : col.length;
      col.splice(toIndex === -1 ? col.length : toIndex, 0, moved);

      setBoard({ ...board, [targetStatus]: col });
      startTransition(() => {
        reorderHypotheses(col.map((i) => i.id)).catch((err: unknown) => {
          setBoard(prevBoard);
          window.alert(err instanceof Error ? err.message : "Não foi possível reordenar.");
        });
      });
      return;
    }

    // Mover pra outra coluna = mudar status = override manual, que exige
    // justificativa (mesma regra do botão "Forçar transição de status").
    const targetLabel = columns.find((c) => c.status === targetStatus)?.label ?? targetStatus;
    const reason = window.prompt(
      `Mover esta hipótese para "${targetLabel}" força uma transição manual de status e fica registrado no histórico. Justificativa:`
    );
    if (!reason || !reason.trim()) return; // cancelado — nada muda

    const movedItem = board[fromStatus].find((i) => i.id === draggedId);
    if (!movedItem) return;
    const newSourceCol = board[fromStatus].filter((i) => i.id !== draggedId);
    const newTargetCol = [...board[targetStatus]];
    const toIndex = targetId ? newTargetCol.findIndex((i) => i.id === targetId) : newTargetCol.length;
    newTargetCol.splice(toIndex === -1 ? newTargetCol.length : toIndex, 0, movedItem);

    setBoard({ ...board, [fromStatus]: newSourceCol, [targetStatus]: newTargetCol });
    startTransition(() => {
      moveHypothesisToColumn(draggedId, targetStatus, reason.trim(), newTargetCol.map((i) => i.id)).catch(
        (err: unknown) => {
          setBoard(prevBoard);
          window.alert(err instanceof Error ? err.message : "Não foi possível mover esta hipótese.");
        }
      );
    });
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {columns.map((col) => {
        const items = board[col.status] ?? [];
        return (
          <div
            key={col.status}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              handleDrop(col.status, null);
            }}
            className={`w-72 shrink-0 rounded-xl p-2 ${
              col.highlighted ? "bg-indigo-50 ring-1 ring-indigo-300" : "bg-slate-100/60"
            }`}
          >
            <div className="mb-2 flex items-center justify-between px-1">
              <Badge color={col.color}>{col.label}</Badge>
              <span className="text-xs text-slate-400">{items.length}</span>
            </div>
            <div className="min-h-[40px] space-y-2">
              {items.map((h) => {
                const key = `${col.status}:${h.id}`;
                return (
                  <div
                    key={h.id}
                    draggable
                    onDragStart={() => setDragId(h.id)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (dragOverKey !== key) setDragOverKey(key);
                    }}
                    onDragLeave={() => setDragOverKey((cur) => (cur === key ? null : cur))}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleDrop(col.status, h.id);
                    }}
                    onDragEnd={() => {
                      setDragId(null);
                      setDragOverKey(null);
                    }}
                    className={dragOverKey === key ? "rounded-xl ring-2 ring-indigo-300" : ""}
                  >
                    <Link href={`/hypotheses/${h.id}`} draggable={false}>
                      <Card
                        className={`cursor-grab select-none hover:shadow-md active:cursor-grabbing ${
                          dragId === h.id ? "opacity-40" : ""
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium text-slate-900">{h.title}</p>
                          {h.isStale && (
                            <span title={`Evidência mais recente tem ${h.daysSinceLatest} dias`}>
                              <Badge color="amber">⏱ revalidar</Badge>
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-slate-400">{h.typeLabel}</p>
                        {h.products.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {h.products.map((p) => (
                              <Badge key={p.id} color="indigo">
                                {p.name}
                              </Badge>
                            ))}
                          </div>
                        )}
                        <p className="mt-2 text-xs font-medium text-slate-500">Confiança: {h.confidenceScore}</p>
                      </Card>
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
