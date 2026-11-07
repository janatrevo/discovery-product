"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Label, Select } from "@/components/ui/primitives";
import { createFieldMediaUpload, registerFieldMedia } from "@/app/(app)/experiments/observation-media-actions";

const MAX_BYTES = 50 * 1024 * 1024; // limite do Storage no plano gratuito do Supabase

type Row = { name: string; status: "waiting" | "uploading" | "done" | "error"; progress: number; error?: string };

function guessType(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    heic: "image/heic",
    gif: "image/gif",
    mp4: "video/mp4",
    mov: "video/quicktime",
    webm: "video/webm",
    m4v: "video/mp4",
  };
  return map[ext] ?? "";
}

function formatSize(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

function putFile(signedUrl: string, file: File, onProgress: (pct: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const body = new FormData();
    body.append("cacheControl", "3600");
    body.append("", file);
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signedUrl);
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) onProgress(Math.round((ev.loaded / ev.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let msg = `Falha no envio (HTTP ${xhr.status}).`;
      if (xhr.status === 413) msg = "Arquivo maior que 50 MB (limite do Storage). Comprima ou corte o vídeo.";
      reject(new Error(msg));
    };
    xhr.onerror = () => reject(new Error("Erro de rede durante o envio. Tente novamente."));
    xhr.send(body);
  });
}

// Envia várias fotos/vídeos de uma vez, direto do navegador para o Storage, e
// registra cada um no experimento (com sistema/tela e legenda em comum).
export function FieldMediaUploader({
  experimentId,
  observations,
  defaultObservationId,
}: {
  experimentId: string;
  observations: { id: string; title: string }[];
  defaultObservationId?: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [systemName, setSystemName] = useState("");
  const [caption, setCaption] = useState("");
  const [observationId, setObservationId] = useState(defaultObservationId ?? "");
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [finished, setFinished] = useState("");

  function update(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (files.length === 0 || busy) return;
    setBusy(true);
    setFinished("");
    setRows(files.map((f) => ({ name: `${f.name} (${formatSize(f.size)})`, status: "waiting", progress: 0 })));

    let ok = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      update(i, { status: "uploading", progress: 0 });
      try {
        const contentType = guessType(file);
        if (!contentType) throw new Error("Tipo de arquivo não reconhecido.");
        if (file.size > MAX_BYTES) {
          throw new Error(`Arquivo de ${formatSize(file.size)}: o limite é 50 MB. Comprima ou corte o vídeo.`);
        }
        const { signedUrl, path } = await createFieldMediaUpload(experimentId, file.name, contentType);
        await putFile(signedUrl, file, (pct) => update(i, { progress: pct }));
        await registerFieldMedia(experimentId, {
          path,
          fileName: file.name,
          contentType,
          systemName,
          caption,
          observationId: observationId || undefined,
        });
        update(i, { status: "done", progress: 100 });
        ok++;
      } catch (err) {
        update(i, { status: "error", error: err instanceof Error ? err.message : "Falha ao enviar." });
      }
    }

    setBusy(false);
    if (ok > 0) {
      setFinished(ok === files.length ? `${ok} arquivo(s) enviado(s).` : `${ok} de ${files.length} enviado(s). Veja os erros abaixo.`);
      router.refresh();
    }
    if (ok === files.length) {
      setFiles([]);
      setCaption("");
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3">
      <div>
        <Label>Fotos e vídeos</Label>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,video/*,.heic,.mov,.mp4,.webm"
          disabled={busy}
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
        />
        <p className="mt-1 text-xs text-slate-500">
          Dá para escolher vários de uma vez. Limite de 50 MB por arquivo. Fotos HEIC do iPhone podem não abrir em alguns
          navegadores; se puder, envie em JPG.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label>Sistema ou tela (vale para todos desta remessa)</Label>
          <Input
            value={systemName}
            onChange={(e) => setSystemName(e.target.value)}
            placeholder="Ex.: Animati — fila de atendimento"
            disabled={busy}
          />
        </div>
        <div>
          <Label>Registro de observação (opcional)</Label>
          <Select value={observationId} onChange={(e) => setObservationId(e.target.value)} disabled={busy}>
            <option value="">Nenhum (do experimento em geral)</option>
            {observations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.title}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div>
        <Label>Legenda (opcional)</Label>
        <Input
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="O que estas imagens mostram? Você edita cada uma depois."
          disabled={busy}
        />
      </div>

      {rows.length > 0 && (
        <ul className="space-y-1.5">
          {rows.map((r, i) => (
            <li key={i} className="text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-slate-600">{r.name}</span>
                <span
                  className={
                    r.status === "done"
                      ? "text-emerald-700"
                      : r.status === "error"
                        ? "text-red-600"
                        : "text-slate-500"
                  }
                >
                  {r.status === "waiting" && "aguardando"}
                  {r.status === "uploading" && `${r.progress}%`}
                  {r.status === "done" && "✓ enviado"}
                  {r.status === "error" && "erro"}
                </span>
              </div>
              {r.status === "uploading" && (
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                  <div className="h-full bg-indigo-600 transition-all" style={{ width: `${r.progress}%` }} />
                </div>
              )}
              {r.status === "error" && <p className="mt-0.5 text-red-600">{r.error}</p>}
            </li>
          ))}
        </ul>
      )}

      {finished && <p className="text-xs text-emerald-700">{finished}</p>}

      <Button type="submit" size="sm" disabled={busy || files.length === 0}>
        {busy ? "Enviando… não feche a página" : files.length > 0 ? `Enviar ${files.length} arquivo(s)` : "Escolha os arquivos"}
      </Button>
    </form>
  );
}
