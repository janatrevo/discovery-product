import { Badge, Button } from "@/components/ui/primitives";
import { deleteFieldMedia, updateFieldMedia } from "@/app/(app)/experiments/observation-media-actions";
import type { FieldMediaItem } from "@/lib/field-media";

// Galeria de fotos e vídeos, agrupada por sistema/tela. Componente de servidor:
// editar legenda e excluir usam Server Actions via formulário.
export function FieldMediaGallery({
  items,
  canEdit,
  observationTitles = {},
}: {
  items: FieldMediaItem[];
  canEdit: boolean;
  observationTitles?: Record<string, string>;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-slate-400">Nenhuma foto ou vídeo ainda.</p>;
  }

  const groups = new Map<string, FieldMediaItem[]>();
  for (const item of items) {
    const key = item.systemName?.trim() || "Sem sistema indicado";
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  return (
    <div className="space-y-5">
      {[...groups.entries()].map(([system, list]) => (
        <section key={system}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {system} <span className="font-normal normal-case text-slate-400">({list.length})</span>
          </p>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {list.map((m) => (
              <li key={m.id} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                {m.url ? (
                  m.kind === "video" ? (
                    <video src={m.url} controls preload="metadata" className="aspect-video w-full bg-black" />
                  ) : (
                    <a href={m.url} target="_blank" rel="noreferrer" title="Abrir em tamanho original">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={m.url} alt={m.caption || m.fileName || "Foto"} className="aspect-video w-full bg-slate-50 object-contain" />
                    </a>
                  )
                ) : (
                  <div className="flex aspect-video w-full items-center justify-center bg-slate-50 px-3 text-center text-xs text-amber-700">
                    Arquivo indisponível no momento.
                  </div>
                )}
                <div className="space-y-1 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <Badge color={m.kind === "video" ? "indigo" : "amber"}>{m.kind === "video" ? "vídeo" : "foto"}</Badge>
                    <span className="text-xs text-slate-400">{new Date(m.createdAt).toLocaleDateString("pt-BR")}</span>
                  </div>
                  {m.caption && <p className="whitespace-pre-wrap text-sm text-slate-700">{m.caption}</p>}
                  <p className="truncate text-xs text-slate-400">
                    {m.fileName}
                    {m.observationId && observationTitles[m.observationId] ? ` · ${observationTitles[m.observationId]}` : ""}
                  </p>
                  {canEdit && (
                    <details className="pt-1">
                      <summary className="cursor-pointer text-xs font-medium text-indigo-700">Editar ou excluir</summary>
                      <form action={updateFieldMedia.bind(null, m.id)} className="mt-2 space-y-2">
                        <input
                          name="systemName"
                          defaultValue={m.systemName ?? ""}
                          placeholder="Sistema ou tela (ex.: Animati — agenda)"
                          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                        />
                        <textarea
                          name="caption"
                          defaultValue={m.caption ?? ""}
                          rows={2}
                          placeholder="Legenda: o que esta imagem mostra?"
                          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                        />
                        <Button type="submit" size="sm">
                          Salvar
                        </Button>
                      </form>
                      <form action={deleteFieldMedia.bind(null, m.id)} className="mt-2">
                        <Button type="submit" size="sm" variant="secondary">
                          Excluir arquivo
                        </Button>
                      </form>
                    </details>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
