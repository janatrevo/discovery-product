"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { computeSpeakerStats, formatTimestamp, speakerLabel, type TranscriptSegment } from "@/lib/transcript-parser";

type Props = {
  segments: TranscriptSegment[];
  audioUrl: string | null;
  intervieweeName?: string | null;
  // Server Action (renameInterviewSpeaker já com o interviewId aplicado).
  renameSpeakerAction?: (formData: FormData) => Promise<void>;
};

// Classes completas (o Tailwind só gera o que aparece escrito por inteiro).
const COLORS = [
  { bar: "bg-indigo-500", avatar: "bg-indigo-100 text-indigo-700" },
  { bar: "bg-emerald-500", avatar: "bg-emerald-100 text-emerald-700" },
  { bar: "bg-amber-500", avatar: "bg-amber-100 text-amber-800" },
  { bar: "bg-rose-500", avatar: "bg-rose-100 text-rose-700" },
  { bar: "bg-sky-500", avatar: "bg-sky-100 text-sky-700" },
  { bar: "bg-violet-500", avatar: "bg-violet-100 text-violet-700" },
  { bar: "bg-teal-500", avatar: "bg-teal-100 text-teal-700" },
  { bar: "bg-orange-500", avatar: "bg-orange-100 text-orange-800" },
];

function initials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const parts = text.split(new RegExp(`(${escapeRegExp(query.trim())})`, "gi"));
  return (
    <>
      {parts.map((p, i) =>
        p.toLowerCase() === query.trim().toLowerCase() ? (
          <mark key={i} className="rounded bg-yellow-200 px-0.5">
            {p}
          </mark>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        )
      )}
    </>
  );
}

export function InterviewTranscriptViewer({ segments, audioUrl, intervieweeName, renameSpeakerAction }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRate] = useState(1);
  const [follow, setFollow] = useState(true);
  const [query, setQuery] = useState("");
  const [onlySpeaker, setOnlySpeaker] = useState<string | null>(null);

  const stats = useMemo(() => computeSpeakerStats(segments, duration || null), [segments, duration]);
  const colorOf = (name: string) => COLORS[Math.max(0, stats.speakers.findIndex((s) => s.name === name)) % COLORS.length];
  const hasTimes = segments.some((s) => s.start !== null);

  const activeIndex = useMemo(() => {
    if (!audioUrl || !hasTimes) return -1;
    let idx = -1;
    segments.forEach((s, i) => {
      if (s.start !== null && s.start <= current) idx = i;
    });
    return idx;
  }, [segments, current, audioUrl, hasTimes]);

  useEffect(() => {
    if (playing && follow && activeIndex >= 0) {
      rowRefs.current[activeIndex]?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [activeIndex, playing, follow]);

  function seek(t: number, play = true) {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = Math.max(0, t);
    setCurrent(a.currentTime);
    if (play) void a.play();
  }

  function togglePlay() {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) void a.play();
    else a.pause();
  }

  function changeRate(r: number) {
    setRate(r);
    if (audioRef.current) audioRef.current.playbackRate = r;
  }

  const q = query.trim().toLowerCase();
  const visible = segments
    .map((seg, i) => ({ seg, i }))
    .filter(({ seg }) => (!onlySpeaker || speakerLabel(seg.speaker) === onlySpeaker) && (!q || seg.text.toLowerCase().includes(q)));

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="grid grid-cols-1 md:grid-cols-[210px_1fr]">
        {/* Participantes */}
        <aside className="border-b border-slate-100 p-4 md:border-b-0 md:border-r">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Participantes</p>
          <ul className="space-y-3">
            {stats.speakers.map((sp) => {
              const color = colorOf(sp.name);
              const isInterviewee =
                !!intervieweeName && sp.name.toLowerCase().includes(intervieweeName.trim().toLowerCase());
              return (
                <li key={sp.name}>
                  <button
                    type="button"
                    onClick={() => setOnlySpeaker(onlySpeaker === sp.name ? null : sp.name)}
                    className={clsx(
                      "flex w-full items-center gap-2 rounded-md p-1 text-left hover:bg-slate-50",
                      onlySpeaker === sp.name && "bg-slate-100"
                    )}
                    title="Clique para ver só as falas desta pessoa"
                  >
                    <span className={clsx("flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold", color.avatar)}>
                      {initials(sp.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-800">{sp.name}</span>
                      <span className="block text-xs text-slate-500">
                        {stats.usesTime ? formatTimestamp(sp.seconds) : "—"} · {sp.percent}%
                      </span>
                    </span>
                  </button>
                  <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-slate-100">
                    <div className={clsx("h-full", color.bar)} style={{ width: `${sp.percent}%` }} />
                  </div>
                  {isInterviewee && <span className="mt-1 inline-block text-[10px] font-medium text-indigo-600">Entrevistado(a)</span>}
                  {renameSpeakerAction && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-[11px] text-slate-400 hover:text-indigo-600">renomear</summary>
                      <form action={renameSpeakerAction} className="mt-1 flex gap-1">
                        <input type="hidden" name="from" value={sp.name} />
                        <input
                          name="to"
                          required
                          defaultValue={sp.name}
                          className="w-full min-w-0 rounded border border-slate-300 px-1.5 py-1 text-xs"
                        />
                        <button className="rounded bg-slate-100 px-2 text-xs text-slate-700 hover:bg-slate-200">ok</button>
                      </form>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
          {!stats.usesTime && stats.speakers.length > 0 && (
            <p className="mt-3 text-[11px] text-slate-400">A transcrição não tem horários — a porcentagem é por quantidade de fala.</p>
          )}
        </aside>

        {/* Transcrição */}
        <section className="min-w-0 p-4">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar na transcrição"
              className="w-full max-w-xs rounded-md border border-slate-300 px-3 py-1.5 text-sm placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            {onlySpeaker && (
              <button type="button" onClick={() => setOnlySpeaker(null)} className="text-xs text-indigo-600 hover:underline">
                limpar filtro: {onlySpeaker}
              </button>
            )}
            {audioUrl && hasTimes && (
              <label className="ml-auto flex items-center gap-1.5 text-xs text-slate-500">
                <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
                Acompanhar durante a reprodução
              </label>
            )}
          </div>

          {segments.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">Nenhuma transcrição registrada para esta entrevista.</p>
          ) : visible.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">Nenhum trecho encontrado.</p>
          ) : (
            <div className="space-y-1">
              {visible.map(({ seg, i }) => {
                const name = speakerLabel(seg.speaker);
                const color = colorOf(name);
                return (
                  <div
                    key={i}
                    ref={(el) => {
                      rowRefs.current[i] = el;
                    }}
                    className={clsx("flex gap-3 rounded-lg px-3 py-2 transition-colors", i === activeIndex && "bg-indigo-50")}
                  >
                    <span className={clsx("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold", color.avatar)}>
                      {initials(name)}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-semibold text-slate-800">{name}</span>
                        {seg.start !== null &&
                          (audioUrl ? (
                            <button type="button" onClick={() => seek(seg.start!)} className="text-xs text-indigo-600 hover:underline" title="Ouvir a partir daqui">
                              {formatTimestamp(seg.start)}
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400">{formatTimestamp(seg.start)}</span>
                          ))}
                      </div>
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                        <Highlight text={seg.text} query={query} />
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Faixa do áudio (fica colada na parte de baixo da tela) */}
      {audioUrl && (
        <div className="sticky bottom-0 z-10 rounded-b-xl border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
          <audio
            ref={audioRef}
            src={audioUrl}
            preload="metadata"
            onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
            onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
            onDurationChange={(e) => Number.isFinite(e.currentTarget.duration) && setDuration(e.currentTarget.duration)}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
          />

          {hasTimes && duration > 0 && (
            <div
              className="relative mb-2 h-3 w-full cursor-pointer overflow-hidden rounded bg-slate-100"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                seek(((e.clientX - rect.left) / rect.width) * duration);
              }}
              title="Linha do tempo de quem fala"
            >
              {segments.map((seg, i) => {
                if (seg.start === null) return null;
                const next = segments.slice(i + 1).find((n) => n.start !== null);
                const end = Math.min(next?.start ?? duration, seg.start + 180, duration);
                const left = (seg.start / duration) * 100;
                const width = Math.max(((end - seg.start) / duration) * 100, 0.3);
                return (
                  <div
                    key={i}
                    className={clsx("absolute top-0 h-full", colorOf(speakerLabel(seg.speaker)).bar)}
                    style={{ left: `${left}%`, width: `${width}%` }}
                  />
                );
              })}
              <div className="absolute top-0 h-full w-0.5 bg-slate-900" style={{ left: `${(current / duration) * 100}%` }} />
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={togglePlay}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white hover:bg-indigo-700"
              aria-label={playing ? "Pausar" : "Reproduzir"}
            >
              {playing ? "❚❚" : "▶"}
            </button>
            <button type="button" onClick={() => seek(current - 10, false)} className="text-xs text-slate-600 hover:text-slate-900" title="Voltar 10 segundos">
              ⟲ 10s
            </button>
            <button type="button" onClick={() => seek(current + 10, false)} className="text-xs text-slate-600 hover:text-slate-900" title="Avançar 10 segundos">
              10s ⟳
            </button>
            <span className="w-24 shrink-0 text-xs tabular-nums text-slate-500">
              {formatTimestamp(current)} / {duration ? formatTimestamp(duration) : "--:--"}
            </span>
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.5}
              value={Math.min(current, duration || 0)}
              onChange={(e) => seek(Number(e.target.value), false)}
              className="h-1 min-w-0 flex-1 cursor-pointer accent-indigo-600"
              aria-label="Posição do áudio"
            />
            <select
              value={rate}
              onChange={(e) => changeRate(Number(e.target.value))}
              className="rounded border border-slate-300 bg-white px-1.5 py-1 text-xs"
              aria-label="Velocidade"
            >
              {[0.75, 1, 1.25, 1.5, 2].map((r) => (
                <option key={r} value={r}>
                  {r}x
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
