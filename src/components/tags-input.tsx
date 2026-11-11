"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/primitives";
import { parseTags, tagColor, MAX_TAGS, MAX_TAG_LENGTH } from "@/lib/tags";

// Campo de tags: digite e aperte Enter ou vírgula para adicionar; clique no "×" para
// remover; clique numa tag já usada em outras oportunidades para reaproveitar.
// O valor vai no formulário como um campo escondido (name), tags separadas por vírgula.
export function TagsInput({
  name = "tags",
  initial = [],
  suggestions = [],
}: {
  name?: string;
  initial?: string[];
  suggestions?: string[];
}) {
  const [tags, setTags] = useState<string[]>(initial);
  const [draft, setDraft] = useState("");

  function add(raw: string) {
    const next = parseTags([...tags, raw].join(","));
    setTags(next);
    setDraft("");
  }

  function remove(tag: string) {
    setTags(tags.filter((t) => t !== tag));
  }

  const available = suggestions.filter((s) => !tags.some((t) => t.toLocaleLowerCase("pt-BR") === s.toLocaleLowerCase("pt-BR")));

  return (
    <div>
      <input type="hidden" name={name} value={tags.join(",")} />
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-300 bg-white px-2 py-1.5">
        {tags.map((t) => (
          <span key={t} className="inline-flex items-center gap-1">
            <Badge color={tagColor(t)}>
              {t}
              <button
                type="button"
                onClick={() => remove(t)}
                aria-label={`Remover a tag ${t}`}
                className="ml-1 text-slate-500 hover:text-red-600"
              >
                ×
              </button>
            </Badge>
          </span>
        ))}
        <input
          value={draft}
          maxLength={MAX_TAG_LENGTH}
          disabled={tags.length >= MAX_TAGS}
          onChange={(e) => {
            const v = e.target.value;
            if (v.includes(",") || v.includes(";")) add(v);
            else setDraft(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (draft.trim()) add(draft);
            } else if (e.key === "Backspace" && !draft && tags.length) {
              setTags(tags.slice(0, -1));
            }
          }}
          onBlur={() => draft.trim() && add(draft)}
          placeholder={tags.length ? "" : "Ex.: Fase 1, Mensageria"}
          className="min-w-[8rem] flex-1 border-0 bg-transparent px-1 py-0.5 text-sm outline-none"
        />
      </div>
      <p className="mt-1 text-[11px] text-slate-400">Digite e aperte Enter ou vírgula para adicionar (até {MAX_TAGS} tags).</p>
      {available.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-slate-400">Já usadas:</span>
          {available.map((s) => (
            <button key={s} type="button" onClick={() => add(s)} className="rounded-full">
              <Badge color={tagColor(s)}>+ {s}</Badge>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
