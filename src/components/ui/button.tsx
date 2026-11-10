"use client";

import { useEffect, useState, type ButtonHTMLAttributes, type MouseEvent } from "react";
import { useFormStatus } from "react-dom";
import clsx from "clsx";

// Botões que mostram o andamento da ação. Dentro de um <form action={...}>
// (Server Action), o botão clicado:
//   1) mostra um indicador girando enquanto o servidor trabalha;
//   2) fica desativado (e os outros botões do mesmo formulário também), para
//      não dar para clicar duas vezes e repetir a ação sem querer;
//   3) mostra um "✓" por alguns segundos quando termina.
// Botões type="button" (que só mexem na tela) não são afetados.

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={clsx("h-3.5 w-3.5 shrink-0 animate-spin", className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

// Estado compartilhado entre Button e SubmitLink.
function useSubmitFeedback(type: ButtonHTMLAttributes<HTMLButtonElement>["type"]) {
  const { pending } = useFormStatus();
  const isSubmit = type !== "button" && type !== "reset";
  const busy = isSubmit && pending;

  // "clicked" = foi ESTE botão que disparou o envio (num formulário com vários
  // botões, só o clicado mostra o indicador).
  const [clicked, setClicked] = useState(false);
  const [done, setDone] = useState(false);
  const [wasBusy, setWasBusy] = useState(false);

  // Ajuste de estado durante a renderização (padrão recomendado pelo React):
  // quando o envio termina, limpa "clicked" e acende o "✓".
  if (busy !== wasBusy) {
    setWasBusy(busy);
    if (!busy && clicked) {
      setClicked(false);
      setDone(true);
    }
  }

  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(false), 1800);
    return () => clearTimeout(t);
  }, [done]);

  function markClicked(e: MouseEvent<HTMLButtonElement>) {
    if (!isSubmit || e.defaultPrevented) return; // ex.: confirmação cancelada
    const form = e.currentTarget.form;
    if (form && !form.checkValidity()) return; // campo obrigatório vazio: não envia
    setClicked(true);
    setDone(false);
  }

  return { busy, showSpinner: busy && clicked, done: done && !busy, markClicked };
}

export function Button({
  className,
  variant = "primary",
  size = "md",
  children,
  onClick,
  disabled,
  type,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
}) {
  const { busy, showSpinner, done, markClicked } = useSubmitFeedback(type);
  return (
    <button
      type={type}
      aria-busy={showSpinner || undefined}
      disabled={disabled || busy}
      onClick={(e) => {
        onClick?.(e);
        markClicked(e);
      }}
      className={clsx(
        "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
        size === "sm" ? "px-2.5 py-1.5 text-xs" : "px-3.5 py-2 text-sm",
        variant === "primary" && "bg-indigo-600 text-white hover:bg-indigo-700",
        variant === "secondary" && "bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50",
        variant === "ghost" && "text-slate-600 hover:bg-slate-100",
        variant === "danger" && "bg-red-600 text-white hover:bg-red-700",
        busy && !showSpinner && "cursor-wait",
        showSpinner && "cursor-wait",
        className
      )}
      {...props}
    >
      {showSpinner && <Spinner />}
      {done && <span aria-hidden="true">✓</span>}
      {children}
    </button>
  );
}

// Versão "texto de link" (remover, confirmar, excluir…) para os botões
// pequenos dentro de listas. Mesmo comportamento do Button.
export function SubmitLink({
  className,
  children,
  onClick,
  disabled,
  type,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { busy, showSpinner, done, markClicked } = useSubmitFeedback(type);
  return (
    <button
      type={type ?? "submit"}
      aria-busy={showSpinner || undefined}
      disabled={disabled || busy}
      onClick={(e) => {
        onClick?.(e);
        markClicked(e);
      }}
      className={clsx(
        "inline-flex items-center gap-1 disabled:cursor-wait disabled:opacity-60",
        className
      )}
      {...props}
    >
      {showSpinner && <Spinner className="h-3 w-3" />}
      {done && <span aria-hidden="true">✓</span>}
      {children}
    </button>
  );
}
