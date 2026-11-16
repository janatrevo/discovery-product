// Barra de progresso simples (verde ao completar).
export function ProgressBar({ percent, className = "" }: { percent: number; className?: string }) {
  const complete = percent >= 100;
  return (
    <div
      className={`h-2 w-full overflow-hidden rounded-full bg-slate-100 ${className}`}
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={`h-full rounded-full transition-all ${complete ? "bg-emerald-500" : "bg-indigo-500"}`}
        style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
      />
    </div>
  );
}
