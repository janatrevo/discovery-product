"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/primitives";
import { createEventFileUpload, deleteEventFile, registerEventFile } from "./file-actions";
import { EVENT_FILE_ACCEPT, EVENT_FILE_MAX_BYTES, formatFileSize, isAllowedEventFile, type EventFileItem } from "@/lib/project-event-files";

const TYPES: Record<string, string> = {
  pdf: "application/pdf",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
  txt: "text/plain",
  md: "text/markdown",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  zip: "application/zip",
};

function contentTypeOf(file: File) {
  if (file.type) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return TYPES[ext] ?? "application/octet-stream";
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
      reject(new Error(xhr.status === 413 ? "Arquivo maior que 50 MB (limite do Storage)." : `Falha no envio (HTTP ${xhr.status}).`));
    };
    xhr.onerror = () => reject(new Error("Erro de rede durante o envio. Tente novamente."));
    xhr.send(body);
  });
}

type Row = { name: string; status: "waiting" | "uploading" | "done" | "error"; progress: number; error?: string };

// Lista os anexos de um registro (com download) e deixa enviar novos, direto do navegador.
export function EventFiles({ eventId, files, canEdit, autoFocus }: { eventId: string; files: EventFileItem[]; canEdit: boolean; autoFocus?: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<File[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  function update(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!picked.length || busy) return;
    setBusy(true);
    setMsg("");
    setRows(picked.map((f) => ({ name: `${f.name} (${formatFileSize(f.size)})`, status: "waiting", progress: 0 })));
    let ok = 0;
    for (let i = 0; i < picked.length; i++) {
      const file = picked[i];
      update(i, { status: "uploading", progress: 0 });
      try {
        if (!isAllowedEventFile(file.name)) throw new Error("Tipo de arquivo não aceito (use PDF, PowerPoint, Word, Excel, imagem, áudio, vídeo ou ZIP).");
        if (file.size > EVENT_FILE_MAX_BYTES) throw new Error(`Arquivo de ${formatFileSize(file.size)}: o limite é 50 MB.`);
        const { signedUrl, path } = await createEventFileUpload(eventId, file.name, file.size);
        await putFile(signedUrl, file, (pct) => update(i, { progress: pct }));
        await registerEventFile(eventId, { path, fileName: file.name, contentType: contentTypeOf(file), size: file.size });
        update(i, { status: "done", progress: 100 });
        ok++;
      } catch (err) {
        update(i, { status: "error", error: err instanceof Error ? err.message : "Falha ao enviar." });
      }
    }
    setBusy(false);
    if (ok > 0) {
      setMsg(ok === picked.length ? `${ok} arquivo(s) anexado(s).` : `${ok} de ${picked.length} anexado(s). Veja os erros abaixo.`);
      router.refresh();
    }
    if (ok === picked.length) {
      setPicked([]);
      setRows([]);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Remover este arquivo do registro?")) return;
    try {
      await deleteEventFile(id);
      router.refresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Não foi possível remover.");
    }
  }

  return (
    <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="mb-2 text-xs font-semibold text-slate-700">Arquivos anexados ({files.length})</p>
      {files.length > 0 ? (
        <ul className="mb-3 space-y-1.5">
          {files.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-2 text-sm">
              <a href={`/api/project-event-files/${f.id}`} className="min-w-0 truncate text-indigo-700 hover:underline" title={f.name}>
                📎 {f.name}
              </a>
              <span className="flex shrink-0 items-center gap-3 text-xs text-slate-400">
                {formatFileSize(f.size)}
                {canEdit && (
                  <button type="button" onClick={() => remove(f.id)} className="text-red-600 hover:underline">
                    remover
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-3 text-xs text-slate-500">Nenhum arquivo ainda.</p>
      )}

      {canEdit && (
        <form onSubmit={send} className="space-y-2">
          <input
            ref={inputRef}
            type="file"
            multiple
            autoFocus={autoFocus}
            accept={EVENT_FILE_ACCEPT}
            disabled={busy}
            onChange={(e) => setPicked(Array.from(e.target.files ?? []))}
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-200 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-300"
          />
          <p className="text-xs text-slate-500">PDF, PowerPoint, Word, Excel, imagens, áudio, vídeo ou ZIP. Até 50 MB por arquivo; dá para escolher vários.</p>
          {rows.length > 0 && (
            <ul className="space-y-1.5">
              {rows.map((r, i) => (
                <li key={i} className="text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-slate-600">{r.name}</span>
                    <span className={r.status === "done" ? "text-emerald-700" : r.status === "error" ? "text-red-600" : "text-slate-500"}>
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
          {msg && <p className="text-xs text-emerald-700">{msg}</p>}
          <Button type="submit" size="sm" disabled={busy || picked.length === 0}>
            {busy ? "Enviando… não feche a página" : picked.length ? `Anexar ${picked.length} arquivo(s)` : "Escolha os arquivos"}
          </Button>
        </form>
      )}
    </div>
  );
}
