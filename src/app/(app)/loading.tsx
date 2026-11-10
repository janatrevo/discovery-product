import { Spinner } from "@/components/ui/button";

// Aparece automaticamente enquanto uma página do sistema carrega (ao clicar
// num link ou botão que leva para outra tela), para não parecer que travou.
export default function Loading() {
  return (
    <div className="flex items-center gap-2 py-16 text-sm text-slate-500" role="status" aria-live="polite">
      <Spinner className="h-4 w-4 text-indigo-600" />
      Carregando…
    </div>
  );
}
