"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  // Server Action que autoriza o envio e devolve a URL assinada (ver
  // createInterviewAudioUpload em research/interviews/actions.ts).
  createUploadUrl: (fileName: string, contentType: string) => Promise<{ signedUrl: string; path: string }>;
  name?: string;
  hasExisting?: boolean;
};

type Status = "idle" | "uploading" | "done" | "error";

function formatSize(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

// Campo de arquivo que envia o áudio DIRETO para o Supabase Storage (o
// arquivo não passa pelo servidor da Vercel, que limita o corpo a ~4,5 MB) e
// guarda só o caminho resultante num <input hidden>, que vai no formulário.
export function AudioUploadField({ createUploadUrl, name = "audioPath", hasExisting = false }: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [fileInfo, setFileInfo] = useState("");
  const [path, setPath] = useState("");
  const [error, setError] = useState("");
  const [blocked, setBlocked] = useState(false);
  const hiddenRef = useRef<HTMLInputElement>(null);
  const statusRef = useRef<Status>("idle");
  statusRef.current = status;

  // Enquanto o envio não termina, o formulário não pode ser submetido —
  // senão a entrevista seria registrada sem o áudio.
  useEffect(() => {
    const form = hiddenRef.current?.form;
    if (!form) return;
    const onSubmit = (e: Event) => {
      if (statusRef.current === "uploading") {
        e.preventDefault();
        e.stopImmediatePropagation();
        setBlocked(true);
      }
    };
    form.addEventListener("submit", onSubmit, true);
    return () => form.removeEventListener("submit", onSubmit, true);
  }, []);

  useEffect(() => {
    if (status !== "uploading") setBlocked(false);
  }, [status]);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setPath("");
    setError("");
    if (!file) {
      setStatus("idle");
      return;
    }
    setFileInfo(`${file.name} (${formatSize(file.size)})`);
    setStatus("uploading");
    setProgress(0);

    try {
      const { signedUrl, path: storagePath } = await createUploadUrl(file.name, file.type || "audio/mpeg");

      await new Promise<void>((resolve, reject) => {
        const body = new FormData();
        body.append("cacheControl", "3600");
        body.append("", file);
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", signedUrl);
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) setProgress(Math.round((ev.loaded / ev.total) * 100));
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) return resolve();
          let msg = `Falha no envio (HTTP ${xhr.status}).`;
          try {
            const parsed = JSON.parse(xhr.responseText);
            if (parsed?.message) msg = parsed.message;
            if (xhr.status === 413) msg = "Arquivo maior que o limite do Storage (50 MB no plano gratuito do Supabase).";
          } catch {}
          reject(new Error(msg));
        };
        xhr.onerror = () => reject(new Error("Erro de rede durante o envio. Tente novamente."));
        xhr.send(body);
      });

      setPath(storagePath);
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao enviar o áudio.");
      setStatus("error");
    }
  }

  return (
    <div>
      <input type="hidden" name={name} value={path} ref={hiddenRef} />
      <input
        type="file"
        accept="audio/*,video/mp4,video/webm,.m4a,.mp3,.wav,.ogg,.webm,.aac,.mp4"
        onChange={onFileChange}
        className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
      />
      {status === "uploading" && (
        <div className="mt-2">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div className="h-full bg-indigo-600 transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Enviando {fileInfo} — {progress}%. Aguarde terminar antes de salvar.
          </p>
        </div>
      )}
      {status === "done" && <p className="mt-1 text-xs text-emerald-700">✓ Áudio enviado: {fileInfo}</p>}
      {status === "error" && <p className="mt-1 text-xs text-red-600">{error}</p>}
      {blocked && <p className="mt-1 text-xs text-amber-700">O áudio ainda está sendo enviado — aguarde terminar para salvar.</p>}
      {status === "idle" && hasExisting && (
        <p className="mt-1 text-xs text-slate-500">Já existe um áudio anexado. Selecione outro arquivo só se quiser substituí-lo.</p>
      )}
    </div>
  );
}
