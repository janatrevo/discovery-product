"use client";

// Tour guiado client-side, sem nenhuma dependência nova — usa apenas
// getBoundingClientRect() dos itens do menu lateral (marcados com
// data-tour-id em src/components/sidebar.tsx) para desenhar um "spotlight"
// (via a técnica de box-shadow gigante, sem precisar de SVG/mask) e um
// tooltip ao lado explicando o que se cria ali e em que ordem.
//
// Abre sozinho na primeira vez que alguém loga (flag em localStorage) e pode
// ser reaberto a qualquer momento pelo botão "🎓 Ver tour guiado" no rodapé
// do menu lateral.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

type TourStep = {
  tourId: string;
  title: string;
  description: string;
};

const STEPS: TourStep[] = [
  {
    tourId: "nav-dashboard",
    title: "Comece aqui: Dashboard",
    description:
      "Visão geral do projeto — quantas hipóteses, evidências, oportunidades e decisões você já tem, e quanto disso é simulação de IA vs. dado real.",
  },
  {
    tourId: "nav-products",
    title: "1. Products & Concepts",
    description:
      "Cadastre o produto, feature ou conceito que você quer validar. Não é obrigatório, mas dá contexto às hipóteses e aos testes com personas.",
  },
  {
    tourId: "nav-personas",
    title: "2. Personas",
    description:
      'Quem você acredita que vai usar isso? Crie a partir de pesquisa real ("research-based") ou como palpite inicial ("sintética") — a origem fica sempre visível.',
  },
  {
    tourId: "nav-hypotheses",
    title: "3. Hypotheses",
    description:
      "A entidade central da plataforma — evidência, experimento, oportunidade e decisão se conectam a uma hipótese. Toda investigação começa criando uma aqui.",
  },
  {
    tourId: "nav-research",
    title: "4. Research & Testing",
    description:
      "Onde você coleta evidência: surveys, entrevistas com codificação qualitativa, testes de usabilidade, ou simulações de IA para explorar rápido (simulação nunca conta como evidência real).",
  },
  {
    tourId: "nav-repository",
    title: "5. Research Repository",
    description:
      'Todas as evidências reais do projeto, num só lugar. É aqui que você "promove" resultados de survey/entrevista para o Confidence Score, e roda a análise de padrões cruzando hipóteses diferentes.',
  },
  {
    tourId: "nav-opportunities",
    title: "6. Discovery Board",
    description:
      "Transforme uma hipótese com evidência em uma oportunidade priorizada — impacto, frequência e severidade são ponderados pela confiança de evidência real por trás.",
  },
  {
    tourId: "nav-decisions",
    title: "7. Decision Log",
    description:
      "Registre a decisão final. É obrigatório referenciar a hipótese e/ou evidência que a sustentou, a menos que você marque que está sobrepondo a metodologia recomendada.",
  },
  {
    tourId: "nav-reports",
    title: "8. Reports",
    description: "Exporte um resumo em Markdown para compartilhar com alguém fora da plataforma.",
  },
  {
    tourId: "nav-azure-devops",
    title: "Azure DevOps",
    description:
      "Cards do tipo Feature do board Trevo Labs, sincronizados direto com o Azure DevOps. Só administradores (Owner) podem criar, editar ou excluir.",
  },
  {
    tourId: "nav-settings",
    title: "Settings",
    description: "Ajuste os limiares de confiança do projeto, convide membros do time, e crie ou troque entre projetos.",
  },
];

const STORAGE_KEY = "trevo_tour_seen_v1";

type TourContextValue = {
  start: () => void;
};

const TourContext = createContext<TourContextValue | null>(null);

export function useProductTour() {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useProductTour precisa estar dentro de <ProductTourProvider>.");
  return ctx;
}

export function ProductTourProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  // Abre sozinho na primeira visita — nunca de novo depois disso, a menos
  // que a pessoa clique em "Ver tour guiado" manualmente.
  useEffect(() => {
    try {
      const seen = window.localStorage.getItem(STORAGE_KEY);
      if (!seen) {
        setStepIndex(0);
        setOpen(true);
      }
    } catch {
      // localStorage indisponível (ex.: modo privado) — só não abre sozinho.
    }
  }, []);

  const stop = useCallback(() => {
    setOpen(false);
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignora — pior caso é o tour abrir de novo na próxima visita.
    }
  }, []);

  const start = useCallback(() => {
    setStepIndex(0);
    setOpen(true);
  }, []);

  const next = useCallback(() => {
    setStepIndex((i) => {
      if (i + 1 >= STEPS.length) {
        stop();
        return i;
      }
      return i + 1;
    });
  }, [stop]);

  const prev = useCallback(() => {
    setStepIndex((i) => Math.max(0, i - 1));
  }, []);

  const value = useMemo(() => ({ start }), [start]);

  return (
    <TourContext.Provider value={value}>
      {children}
      {open && (
        <TourOverlay
          step={STEPS[stepIndex]}
          stepIndex={stepIndex}
          total={STEPS.length}
          onNext={next}
          onPrev={prev}
          onClose={stop}
        />
      )}
    </TourContext.Provider>
  );
}

function TourOverlay({
  step,
  stepIndex,
  total,
  onNext,
  onPrev,
  onClose,
}: {
  step: TourStep;
  stepIndex: number;
  total: number;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    function measure() {
      const el = document.querySelector(`[data-tour-id="${step.tourId}"]`);
      if (el) setRect(el.getBoundingClientRect());
    }
    measure();
    window.addEventListener("resize", measure);
    // O menu lateral não muda de layout sozinho, mas isso cobre qualquer
    // re-render/animação que desloque o item durante o tour.
    const id = window.setInterval(measure, 300);
    return () => {
      window.removeEventListener("resize", measure);
      window.clearInterval(id);
    };
  }, [step.tourId]);

  const pad = 6;
  const highlightStyle: React.CSSProperties = rect
    ? {
        position: "fixed",
        top: rect.top - pad,
        left: rect.left - pad,
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
        borderRadius: 10,
        boxShadow: "0 0 0 9999px rgba(15, 23, 42, 0.55)",
        border: "2px solid white",
        pointerEvents: "none",
        zIndex: 60,
        transition: "top 150ms ease, left 150ms ease",
      }
    : { position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.55)", zIndex: 60 };

  const viewportH = typeof window !== "undefined" ? window.innerHeight : 800;
  const viewportW = typeof window !== "undefined" ? window.innerWidth : 1200;
  const tooltipTop = rect ? Math.min(Math.max(rect.top - 8, 16), viewportH - 220) : viewportH / 2 - 100;
  const tooltipLeft = rect ? Math.min(rect.right + 16, viewportW - 340) : viewportW / 2 - 160;

  return (
    <>
      <div style={highlightStyle} />
      <div className="fixed z-[61] w-80 rounded-xl bg-white p-4 shadow-xl" style={{ top: tooltipTop, left: tooltipLeft }}>
        <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-indigo-500">
          Passo {stepIndex + 1} de {total}
        </p>
        <p className="mb-1 text-sm font-semibold text-slate-900">{step.title}</p>
        <p className="mb-3 text-xs leading-relaxed text-slate-600">{step.description}</p>
        <div className="flex items-center justify-between">
          <button type="button" onClick={onClose} className="text-xs text-slate-400 hover:text-slate-600">
            Pular tour
          </button>
          <div className="flex gap-2">
            {stepIndex > 0 && (
              <button
                type="button"
                onClick={onPrev}
                className="rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
              >
                Anterior
              </button>
            )}
            <button
              type="button"
              onClick={onNext}
              className="rounded-md bg-indigo-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
            >
              {stepIndex + 1 === total ? "Concluir" : "Próximo"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
