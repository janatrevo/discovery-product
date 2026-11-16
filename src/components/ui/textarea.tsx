"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, type TextareaHTMLAttributes } from "react";
import clsx from "clsx";

// Caixa de texto que cresce sozinha para mostrar TODO o conteúdo (sem precisar
// arrastar o canto para ler). `rows` vira a altura mínima. Passa de ~75% da
// altura da janela, a caixa rola por dentro em vez de crescer sem fim.
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, onInput, ...props },
  ref
) {
  const inner = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => inner.current as HTMLTextAreaElement);

  const fit = useCallback(() => {
    const el = inner.current;
    if (!el) return;
    el.style.height = "auto";
    const max = Math.round(window.innerHeight * 0.75);
    el.style.height = `${Math.min(el.scrollHeight + 2, max)}px`;
    el.style.overflowY = el.scrollHeight + 2 > max ? "auto" : "hidden";
  }, []);

  // Ajusta ao montar e a cada mudança de valor controlado.
  useLayoutEffect(() => {
    fit();
  });

  // Ajusta de novo quando a largura da caixa muda (janela redimensionada, menu lateral etc.).
  useEffect(() => {
    const el = inner.current;
    if (!el) return;
    let lastWidth = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth !== lastWidth) {
        lastWidth = el.clientWidth;
        fit();
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit]);

  return (
    <textarea
      ref={inner}
      className={clsx(
        "w-full resize-none rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500",
        className
      )}
      onInput={(e) => {
        fit();
        onInput?.(e);
      }}
      {...props}
    />
  );
});
