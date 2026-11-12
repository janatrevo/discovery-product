"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Botão para anexar imagens (fluxogramas) à oportunidade. Aceita várias de uma vez;
// cada uma vai numa requisição separada para respeitar o limite de tamanho da Vercel.
export function ImageUploader({ opportunityId }: { opportunityId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setBusy(true);
    setMessage(null);
    let sent = 0;
    const errors: string[] = [];
    for (const file of files) {
      const body = new FormData();
      body.set("file", file);
      try {
        const res = await fetch(`/api/opportunities/${opportunityId}/images`, { method: "POST", body });
        if (res.ok) {
          sent++;
        } else {
          const data = await res.json().catch(() => ({}));
          errors.push(`${file.name}: ${data.error ?? `erro ${res.status}`}`);
        }
      } catch {
        errors.push(`${file.name}: falha de conexão.`);
      }
    }
    if (inputRef.current) inputRef.current.value = "";
    setBusy(false);
    if (errors.length > 0) {
      setMessage({ kind: "error", text: `${sent > 0 ? `${sent} enviada(s). ` : ""}Não enviei: ${errors.join(" · ")}` });
    } else {
      setMessage({ kind: "ok", text: `${sent} imagem(ns) adicionada(s). Clique em "Atualizar Feature" no Azure DevOps para levá-las ao card.` });
    }
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <label
        className={`inline-flex cursor-pointer items-center rounded-md bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200 ${
          busy ? "pointer-events-none opacity-60" : ""
        }`}
      >
        {busy ? "Enviando…" : "+ Adicionar imagens"}
        <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple className="sr-only" onChange={onPick} disabled={busy} />
      </label>
      <span className="ml-2 text-xs text-slate-400">PNG, JPG, WEBP ou GIF · até 4 MB cada</span>
      {message && (
        <p
          className={`rounded-md border p-2 text-xs ${
            message.kind === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
