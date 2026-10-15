"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/primitives";
import { analyzeHypothesisWithAi } from "@/app/(app)/hypotheses/analysis-actions";

// Dispara a análise por IA. Leva de alguns segundos a cerca de um minuto
// (a IA lê todas as respostas e transcrições), então mostra o andamento.
export function AnalyzeHypothesisButton({ hypothesisId, hasPrevious }: { hypothesisId: string; hasPrevious: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <Button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const res = await analyzeHypothesisWithAi(hypothesisId);
            if (!res.ok) setError(res.error ?? "Não foi possível analisar agora.");
          });
        }}
      >
        {pending ? "Lendo as pesquisas…" : hasPrevious ? "Analisar de novo com IA" : "Analisar com IA"}
      </Button>
      {pending && (
        <p className="mt-2 text-xs text-slate-500">
          A IA está lendo respostas e transcrições. Pode levar até 1 minuto — não feche esta página.
        </p>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
