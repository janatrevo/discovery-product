import type { ReactNode } from "react";
import { Badge, Card, PageHeader } from "@/components/ui/primitives";
import { computeConfidence, METHOD_WEIGHT, type EvidenceForScoring } from "@/lib/confidence";
import { computePriorityScore } from "@/lib/priority-score";
import { EXPERIMENT_METHOD_LABELS } from "@/lib/experiment-methods";
import { HYPOTHESIS_TYPES, STATUS_COLORS, STATUS_LABELS } from "@/lib/hypothesis-types";

// Página de documentação: como o discovery funciona na Trevo, de onde vêm as notas e
// o score e em que metodologias nos apoiamos. Os exemplos de cálculo abaixo são
// executados na hora pelo MESMO código que o sistema usa (confidence.ts e
// priority-score.ts), então não ficam desatualizados quando a fórmula mudar.
export const dynamic = "force-dynamic";

const METHOD_LABELS: Record<string, string> = {
  behavioral: "Dado de comportamento (uso real do sistema)",
  experiment: "Experimento",
  ab_test: "Teste A/B",
  usability_test: "Teste de usabilidade",
  interview: "Entrevista",
  survey: "Survey (questionário)",
  manual: "Registro manual",
};

const DAY = 24 * 60 * 60 * 1000;
function ev(
  id: string,
  type: string,
  favorable: boolean,
  sampleSize: number,
  daysAgo: number
): EvidenceForScoring {
  return {
    id,
    favorable,
    originClass: "real_data",
    type,
    sampleSize,
    qualityScore: 80,
    reliabilityScore: 80,
    evidenceDate: new Date(Date.now() - daysAgo * DAY),
    personaMatchesHypothesis: true,
  };
}

function buildConfidenceExamples() {
  const thresholds = { minSampleSurvey: 30, minSampleInterview: 5 };
  const interviews = [ev("i1", "interview", true, 6, 30), ev("i2", "interview", true, 6, 45), ev("i3", "interview", true, 6, 60)];
  const behavioral = [ev("b1", "behavioral", true, 200, 20), ev("b2", "behavioral", true, 200, 50)];
  const experiment = [ev("x1", "experiment", true, 40, 25)];
  const contrary = [ev("c1", "behavioral", false, 200, 15), ev("c2", "interview", false, 6, 35)];
  return [
    {
      title: "Uma única entrevista",
      text: "Uma entrevista favorável, sozinha, mesmo bem feita.",
      receipt: computeConfidence([interviews[0]], thresholds),
    },
    {
      title: "Seis evidências favoráveis, de três métodos",
      text: "Três entrevistas, dois dados de comportamento (uso real) e um experimento, todos favoráveis, recentes e da persona certa.",
      receipt: computeConfidence([...interviews, ...behavioral, ...experiment], thresholds),
    },
    {
      title: "O mesmo cenário, com evidência contrária forte",
      text: "As mesmas seis evidências, mais duas contrárias (um dado de comportamento e uma entrevista) que ninguém endereçou.",
      receipt: computeConfidence([...interviews, ...behavioral, ...experiment, ...contrary], thresholds),
    },
  ];
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6">
      <h2 className="mb-3 mt-10 border-b border-slate-200 pb-2 text-lg font-semibold text-slate-900">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-slate-700">{children}</div>
    </section>
  );
}

function H3({ children }: { children: ReactNode }) {
  return <h3 className="mt-5 text-sm font-semibold text-slate-900">{children}</h3>;
}

function Formula({ children }: { children: ReactNode }) {
  return (
    <pre className="overflow-x-auto rounded-lg bg-slate-900 px-4 py-3 text-xs leading-relaxed text-slate-100 whitespace-pre-wrap">
      {children}
    </pre>
  );
}

function Callout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 text-sm text-violet-950">
      <p className="mb-1 font-semibold">{title}</p>
      <div className="space-y-2 leading-relaxed">{children}</div>
    </div>
  );
}

function Ext({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-violet-700 underline hover:text-violet-900">
      {children}
    </a>
  );
}

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-left text-xs">
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-3 py-2 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r, i) => (
            <tr key={i} className="align-top">
              {r.map((c, j) => (
                <td key={j} className="px-3 py-2 text-slate-700">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

export default function DocsPage() {
  const confExamples = buildConfidenceExamples();
  const sampleNotes = { impact: 4, frequency: 4, severity: 3, businessPotential: 3, solutionEase: 3 };
  const base = (sampleNotes.impact + sampleNotes.frequency + sampleNotes.severity + sampleNotes.businessPotential + sampleNotes.solutionEase) / 5;
  const scoreExamples = [0, 50, 100].map((c) => ({
    conf: c,
    multiplier: 0.5 + 0.5 * (c / 100),
    score: computePriorityScore({ ...sampleNotes, evidenceConfidence: c }),
  }));

  const TOC = [
    ["caminho", "O caminho de uma ideia até o desenvolvimento"],
    ["regras", "Três regras que não negociamos"],
    ["hipoteses", "Hipóteses, evidências e o Confidence Score"],
    ["pesquisa", "Pesquisa e experimentos"],
    ["score", "Oportunidades e o score de priorização"],
    ["backlog", "Do Discovery Board ao desenvolvimento"],
    ["decisoes", "Registro de decisões"],
    ["metodologia", "Metodologia e leituras para os curiosos"],
    ["calendario", "Calendário do projeto: estimado x real"],
    ["limites", "Limites e cuidados"],
  ];

  return (
    <div className="max-w-4xl pb-16">
      <PageHeader
        title="Documentação: como fazemos discovery"
        description="Como uma ideia vira trabalho para a engenharia, de onde vêm as notas e os scores, por que eles são calculados assim e em quais metodologias nos apoiamos. Escrita para quem está chegando."
      />

      <Card>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Nesta página</p>
        <ol className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          {TOC.map(([id, label], i) => (
            <li key={id}>
              <a href={`#${id}`} className="text-violet-700 hover:underline">
                {i + 1}. {label}
              </a>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs text-slate-500">
          Os exemplos de cálculo desta página são feitos na hora pelo mesmo código que o sistema usa, então acompanham a fórmula real.
        </p>
      </Card>

      {/* 1 ----------------------------------------------------------- */}
      <Section id="caminho" title="1. O caminho de uma ideia até o desenvolvimento">
        <p>
          Discovery é o trabalho de descobrir <strong>o que vale a pena construir</strong> antes de construir. Na ferramenta, o caminho
          tem oito passos. Ele não é uma linha reta: sempre que uma evidência nova aparece, voltamos e ajustamos o que veio antes.
        </p>
        <Table
          head={["Passo", "O que acontece", "Onde fica"]}
          rows={[
            ["1. Produto e personas", "Definimos o que estamos avaliando e quem são as pessoas que usam (por exemplo, atendente do call center, supervisor, paciente).", "Products & Concepts, Personas"],
            ["2. Hipótese", "Uma crença que precisa ser testada, escrita de forma que possa estar errada. Ex.: “a atendente perde ligações porque não vê quem está livre”.", "Hypotheses"],
            ["3. Pesquisa e experimentos", "Entrevistas, observação em campo, surveys, testes de usabilidade e outros métodos produzem evidência.", "Research & Testing"],
            ["4. Evidência e confiança", "Cada evidência é registrada com origem, método e qualidade. O sistema calcula o Confidence Score (0 a 100) da hipótese.", "Dentro de cada hipótese, Research Repository"],
            ["5. Oportunidade", "Um problema ou funcionalidade que vale a pena priorizar. Ganha cinco notas e o score de priorização.", "Discovery Board"],
            ["6. PRD e user stories", "O documento que explica o que construir. A IA escreve um rascunho; uma pessoa revisa.", "Dentro da oportunidade (PRD & User Stories)"],
            ["7. Azure DevOps", "A oportunidade vira uma Feature (épico) e as stories viram itens filhos, para o time de engenharia.", "Azure DevOps"],
            ["8. Decisão", "Registramos o que foi decidido, por quê, e qual evidência sustentou.", "Decision Log"],
          ]}
        />
        <p>
          No Trevo One, <strong>cada oportunidade é uma Feature (um épico)</strong>. Mantemos poucas user stories por feature de propósito:
          quem desenvolve com apoio de IA perde contexto quando as stories são muitas e fragmentadas.
        </p>
      </Section>

      {/* 2 ----------------------------------------------------------- */}
      <Section id="regras" title="2. Três regras que não negociamos">
        <div className="grid gap-3 sm:grid-cols-3">
          <Card>
            <p className="font-semibold text-slate-900">Simulação não é evidência</p>
            <p className="mt-1 text-xs text-slate-600">
              A IA pode simular personas e cenários, mas isso fica marcado como simulação e fica fora do cálculo de confiança. Só dado
              real conta. É uma separação estrutural dos dados, não uma regra que alguém possa contornar sem querer.
            </p>
          </Card>
          <Card>
            <p className="font-semibold text-slate-900">Número é fórmula, não opinião de IA</p>
            <p className="mt-1 text-xs text-slate-600">
              O Confidence Score, o status das hipóteses e o score de priorização são calculados por fórmulas que qualquer pessoa pode
              auditar. A IA ajuda a escrever rascunhos e a explicar o número, mas nunca decide o número.
            </p>
          </Card>
          <Card>
            <p className="font-semibold text-slate-900">O que se muda à mão fica registrado</p>
            <p className="mt-1 text-xs text-slate-600">
              Dá para sobrescrever o status de uma hipótese ou registrar uma decisão sem evidência, mas sempre com motivo e com uma marca
              permanente no histórico. Texto gerado por IA nasce marcado como tal e só passa a “assistido por IA” depois que uma pessoa edita.
            </p>
          </Card>
        </div>
      </Section>

      {/* 3 ----------------------------------------------------------- */}
      <Section id="hipoteses" title="3. Hipóteses, evidências e o Confidence Score">
        <H3>Hipótese</H3>
        <p>
          Toda hipótese tem um tipo, que ajuda a escrevê-la bem e a saber que tipo de evidência procurar:
        </p>
        <Table
          head={["Tipo", "Como escrever"]}
          rows={HYPOTHESIS_TYPES.map((t) => [<strong key={t.value}>{t.label}</strong>, t.hint])}
        />

        <H3>Evidência</H3>
        <p>Cada evidência registra de onde veio, como foi obtida e se ajuda ou contraria a hipótese. Os campos que entram no cálculo:</p>
        <Table
          head={["Campo", "Para que serve"]}
          rows={[
            ["Origem", "Dado real (conta), inferência (visível, mas fora do cálculo) ou simulação de IA (visível, mas fora do cálculo)."],
            ["Método", "Entrevista, survey, comportamento de uso, experimento etc. Cada método tem um peso (tabela abaixo)."],
            ["Data", "Evidência velha vale menos."],
            ["Tamanho da amostra", "Quantas pessoas ou casos sustentam a evidência."],
            ["Qualidade e confiabilidade (0 a 100)", "Quão bem foi conduzida e quanto podemos confiar nela. Se ninguém preencher, usamos 70."],
            ["Persona", "Se a evidência veio da mesma persona da hipótese, vale mais."],
            ["Favorável ou contrária", "Se apoia ou enfraquece a hipótese."],
          ]}
        />

        <H3>Como o Confidence Score é calculado</H3>
        <p>O cálculo tem quatro passos. Primeiro, calculamos a força de cada evidência real:</p>
        <Formula>{`força = peso do método × recência × amostra × representatividade × qualidade × confiabilidade`}</Formula>
        <Table
          head={["Fator", "Regra"]}
          rows={[
            ["Peso do método", "Tabela abaixo: dado de comportamento pesa mais que opinião declarada."],
            ["Recência", "Cai pela metade a cada 365 dias. Evidência de hoje vale 1; de um ano atrás, 0,5."],
            ["Amostra", "Raiz quadrada de (amostra ÷ mínimo), com teto de 1. O mínimo é configurável por projeto (padrão: 30 para survey e 5 para os demais). Sem amostra informada, vale 0,5."],
            ["Representatividade", "1 se a persona da evidência é a da hipótese; 0,7 se não for."],
            ["Qualidade e confiabilidade", "A nota de 0 a 100 dividida por 100 (padrão 70, ou seja, 0,7)."],
          ]}
        />
        <Table
          head={["Método", "Peso"]}
          rows={Object.entries(METHOD_WEIGHT)
            .sort((a, b) => b[1] - a[1])
            .map(([k, w]) => [METHOD_LABELS[k] ?? k, fmt(w)])}
        />
        <p>
          Segundo, somamos a força das evidências favoráveis (F) e das contrárias (C). Terceiro, premiamos a diversidade: cada método
          favorável diferente além do primeiro soma 15% (D), até o máximo de 1,5. Duas fontes diferentes dizendo a mesma coisa valem mais
          que uma fonte repetida. Quarto, o score:
        </p>
        <Formula>{`score = 100 × (F × D) ÷ (F × D + C + 1,5)`}</Formula>
        <p>
          O 1,5 no final é um suavizador: com pouca evidência, o score nunca chega perto de 100. É de propósito. Confiança precisa ser
          conquistada com várias evidências boas.
        </p>
        <p>Depois do cálculo, duas travas limitam o resultado:</p>
        <ul className="ml-5 list-disc space-y-1">
          <li>
            <strong>Limite de 60</strong> quando a evidência contrária tem pelo menos 30% da força da favorável. Contradição não resolvida
            não deixa a hipótese parecer validada.
          </li>
          <li>
            <strong>Limite de 65</strong> quando toda a evidência favorável vem de um único método. Uma só fonte, por melhor que seja, não basta.
          </li>
        </ul>

        <H3>Três exemplos calculados agora pelo sistema</H3>
        <p>
          Todas as evidências abaixo têm qualidade e confiabilidade 80 e são da persona certa. Cada exemplo mostra o score e, quando houve,
          a trava aplicada.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {confExamples.map((e) => (
            <Card key={e.title}>
              <p className="text-xs font-semibold text-slate-900">{e.title}</p>
              <p className="mt-1 text-xs text-slate-500">{e.text}</p>
              <p className="mt-3 text-3xl font-semibold text-slate-900">{fmt(e.receipt.score)}</p>
              <p className="mt-1 text-[11px] text-slate-500">
                Favorável: {fmt(e.receipt.favorableStrength)} · Contrária: {fmt(e.receipt.contraryStrength)} · Diversidade:{" "}
                {fmt(e.receipt.diversityMultiplier)}×
              </p>
              {e.receipt.notes.map((n) => (
                <p key={n} className="mt-2 rounded bg-amber-50 p-2 text-[11px] text-amber-900">
                  {n}
                </p>
              ))}
            </Card>
          ))}
        </div>

        <H3>Status da hipótese</H3>
        <p>
          O status é calculado automaticamente a cada nova evidência. Só dado real entra na conta. Ninguém precisa “mover o card”: ele se mexe
          sozinho e cada mudança fica no histórico com o motivo.
        </p>
        <Table
          head={["Status", "Quando o sistema coloca a hipótese aqui"]}
          rows={[
            [<Badge key="a" color={STATUS_COLORS.not_tested}>{STATUS_LABELS.not_tested}</Badge>, "Ainda não há nenhuma evidência real ligada."],
            [<Badge key="b" color={STATUS_COLORS.investigating}>{STATUS_LABELS.investigating}</Badge>, "Há evidência, mas ainda nenhuma favorável (por exemplo, só contrárias, ainda sem força para invalidar)."],
            [<Badge key="c" color={STATUS_COLORS.partially_validated}>{STATUS_LABELS.partially_validated}</Badge>, "Há evidência favorável, mas ainda faltam critérios para validar."],
            [<Badge key="d" color={STATUS_COLORS.validated}>{STATUS_LABELS.validated}</Badge>, "Ao menos duas fontes favoráveis (dois métodos diferentes ou duas evidências), nenhuma contrária relevante sem resposta e Confidence Score igual ou acima do limiar do projeto (padrão 70)."],
            [<Badge key="e" color={STATUS_COLORS.invalidated}>{STATUS_LABELS.invalidated}</Badge>, "A evidência contrária é mais forte que a favorável, com duas ou mais evidências contrárias ou força contrária de pelo menos 1."],
            [<Badge key="f" color={STATUS_COLORS.inconclusive}>{STATUS_LABELS.inconclusive}</Badge>, "Há evidência favorável e contrária de força parecida (diferença menor que 25% da maior): não dá para decidir."],
          ]}
        />
        <p>
          Se a equipe discordar do status, pode sobrescrevê-lo à mão. Isso exige um motivo, fica marcado como sobrescrita no histórico e
          pode ser devolvido ao automático depois. A hipótese também ganha um alerta quando a evidência mais recente tem mais de 180 dias.
        </p>
      </Section>

      {/* 4 ----------------------------------------------------------- */}
      <Section id="pesquisa" title="4. Pesquisa e experimentos">
        <p>
          Os métodos disponíveis na ferramenta são: {Object.values(EXPERIMENT_METHOD_LABELS).join(", ")}. No Trevo One, a base mais forte
          até agora é a <strong>observação em campo e as entrevistas feitas na ZDI</strong>, com gravações, transcrições e anotações do que
          foi visto no call center e na recepção.
        </p>
        <ul className="ml-5 list-disc space-y-1">
          <li>
            <strong>Critério de sucesso travado antes do resultado.</strong> Em um experimento, definimos antes o que significa “deu certo”.
            Depois de travado, a tela não permite mais alterar o critério, para não ajustarmos a régua depois de ver o resultado. (Não vale para observação em
            campo, que não tem hipótese de sucesso ou fracasso a medir.)
          </li>
          <li>
            <strong>Surveys com detector de pergunta tendenciosa.</strong> Frases como “você concorda que…” ou “não acha que…” induzem a
            resposta. O sistema avisa antes da pergunta ir ao ar.
          </li>
          <li>
            <strong>Entrevistas codificadas com ajuda da IA.</strong> A IA sugere trechos e temas; uma pessoa confirma. Sugestão não confirmada
            não vira evidência.
          </li>
        </ul>
      </Section>

      {/* 5 ----------------------------------------------------------- */}
      <Section id="score" title="5. Oportunidades e o score de priorização">
        <p>
          Uma oportunidade recebe <strong>cinco notas de 1 a 5</strong>, dadas por pessoas. O sistema combina as cinco notas com a
          confiança da hipótese de origem e devolve o score de priorização.
        </p>
        <Table
          head={["Nota", "A pergunta que ela responde", "Como pontuar (orientação)"]}
          rows={[
            ["Impacto no usuário", "Se resolvermos, o quanto a vida de quem usa melhora?", "1: melhora pequena. 3: melhora clara em parte do trabalho. 5: muda a forma de trabalhar."],
            ["Frequência do problema", "Com que frequência e para quantas pessoas isso acontece?", "1: raro. 3: toda semana. 5: o tempo todo, para quase todos."],
            ["Severidade", "Quando acontece, o quanto dói?", "1: incômodo. 3: atrasa ou gera retrabalho. 5: perde paciente, dinheiro ou segurança."],
            ["Potencial de negócio", "Quanto vale para a Trevo e para o cliente (receita, custo evitado, risco)?", "1: pouco valor. 3: valor relevante. 5: decisivo para o contrato."],
            ["Facilidade de solução", "Quão fácil é construir? 5 é o mais fácil.", "1: muito difícil ou incerto. 3: esforço médio. 5: já temos pronto ou é simples."],
          ]}
        />
        <p className="text-xs text-slate-500">
          A coluna “Como pontuar” é uma orientação para quem está chegando, não uma regra do sistema. O que importa é a equipe usar a mesma
          régua e registrar a justificativa na descrição da oportunidade.
        </p>

        <H3>A fórmula</H3>
        <Formula>{`média das cinco notas = (impacto + frequência + severidade + potencial de negócio + facilidade) ÷ 5
fator de evidência    = 0,5 + 0,5 × (confiança da hipótese ÷ 100)      → varia de 0,5 a 1,0
score                 = média das cinco notas × fator de evidência`}</Formula>
        <p>Exemplo calculado agora pelo sistema, com as notas impacto 4, frequência 4, severidade 3, potencial 3 e facilidade 3 (média {fmt(base)}):</p>
        <Table
          head={["Confiança da hipótese", "Fator de evidência", "Score"]}
          rows={scoreExamples.map((s) => [`${s.conf}`, fmt(s.multiplier), <strong key={s.conf}>{fmt(s.score)}</strong>])}
        />

        <H3>Por que o score é assim</H3>
        <ul className="ml-5 list-disc space-y-1">
          <li>
            <strong>Misturar impacto, frequência, severidade, negócio e facilidade</strong> evita escolher só pelo que dói mais ou só pelo que é
            mais fácil. É uma variação dos modelos clássicos de priorização (veja RICE e ICE na seção 8).
          </li>
          <li>
            <strong>O fator de evidência existe para não premiar o que apenas “acreditamos”.</strong> Duas oportunidades com as mesmas notas têm
            scores diferentes se uma tem evidência real por trás e a outra não. A mais bem sustentada sobe.
          </li>
          <li>
            <strong>Mesmo sem evidência, a oportunidade não zera.</strong> O fator mínimo é 0,5, porque uma boa ideia ainda sem teste continua
            sendo uma boa ideia a testar.
          </li>
          <li>
            <strong>A IA nunca decide o score.</strong> As cinco notas são julgamento humano; a IA pode sugerir, mas quem confirma é uma pessoa.
          </li>
        </ul>

        <Callout title="Como usamos o score no Trevo One hoje">
          <p>
            O score é uma <strong>referência</strong>, não a ordem de construção. A ordem do Discovery Board é montada à mão (visão “Minha ordem”),
            porque ela também depende de <strong>dependências e risco</strong>: por exemplo, a confirmação e o lembrete da agenda só funcionam depois
            que o canal de WhatsApp da Mensageria existir, mesmo que o score de uma esteja acima da outra. A visão “Prioridade (score)” mostra
            a ordem pelo número.
          </p>
          <p>
            As notas das oportunidades foram propostas com base nas evidências da imersão na ZDI e revisadas pela Product Manager. Como as
            oportunidades do Trevo One partem da mesma hipótese (situação em novembro de 2026), o fator de evidência é igual para todas e a
            diferença de score vem só das cinco notas.
          </p>
        </Callout>
      </Section>

      {/* 6 ----------------------------------------------------------- */}
      <Section id="backlog" title="6. Do Discovery Board ao desenvolvimento">
        <H3>Discovery Board</H3>
        <p>
          O board tem cinco colunas: Novas, Priorizadas, Em progresso, Concluídas e Arquivadas. Os cards podem ser arrastados para mudar a
          ordem e a coluna. Cada card mostra tags, por exemplo a <strong>fase</strong> do roadmap a que pertence (Fase 0, Fase 1…), e dá para
          cadastrar outras tags ao criar a oportunidade.
        </p>
        <H3>PRD e user stories</H3>
        <p>
          Cada oportunidade tem um PRD com cinco partes: objetivos, fora do escopo, perguntas em aberto, regras de negócio e métricas de
          sucesso. As <strong>perguntas em aberto</strong> são o que ainda não sabemos: não escondemos a dúvida, registramos para alguém responder.
        </p>
        <ul className="ml-5 list-disc space-y-1">
          <li>O rascunho gerado por IA nasce marcado como “gerado por IA”. Ao ser editado por uma pessoa, passa a “assistido por IA”, e existe a ação de marcar como revisado.</li>
          <li>As user stories seguem o formato “Como [quem], quero [o quê], para [por quê]”, com critérios de aceite e prioridade (must, should ou could).</li>
          <li>Poucas stories, bem escritas, por feature.</li>
        </ul>
        <H3>Azure DevOps</H3>
        <p>
          A oportunidade é enviada como uma Feature, com as user stories como itens filhos. Se alguém editar o PRD ou as stories depois,
          é preciso clicar em <strong>“Atualizar Feature”</strong> para levar o novo texto. Excluir uma oportunidade na ferramenta apaga o PRD e as
          stories dela, mas <strong>não apaga a Feature no Azure DevOps</strong>: isso precisa ser feito lá.
        </p>
      </Section>

      {/* 7 ----------------------------------------------------------- */}
      <Section id="decisoes" title="7. Registro de decisões">
        <p>
          O Decision Log é um registro que só cresce: decisões não são apagadas. Cada decisão tem o texto, o motivo e o vínculo com a
          hipótese, a evidência ou a oportunidade que a sustentou. Uma decisão sem nenhuma hipótese ou evidência só é aceita se for marcada como
          <strong> “sobrescrita de metodologia”</strong>. Assim, decidir por intuição ou por pressão do negócio é permitido, mas fica visível
          para sempre que foi isso que aconteceu.
        </p>
      </Section>

      {/* 8 ----------------------------------------------------------- */}
      <Section id="metodologia" title="8. Metodologia e leituras para os curiosos">
        <p>
          O Trevo Discovery combina práticas conhecidas de discovery de produto. Não seguimos nenhum método à risca; adaptamos o que fazia
          sentido ao nosso contexto (laboratórios, atendimento, operação). Os links abaixo são externos e, na maioria, em inglês.
        </p>
        <H3>Base direta do que fazemos</H3>
        <Table
          head={["Prática na ferramenta", "De onde vem", "Para ler"]}
          rows={[
            [
              "Hipóteses ligadas a oportunidades e às pessoas que usam; descoberta como hábito, não como projeto único.",
              "Descoberta contínua e Árvore de Oportunidades, de Teresa Torres.",
              <span key="1">
                <Ext href="https://www.producttalk.org/continuous-discovery-habits-book/">Livro Continuous Discovery Habits</Ext>
                {" · "}
                <Ext href="https://producttalk.org/2023/12/opportunity-solution-trees/">Opportunity Solution Trees</Ext>
              </span>,
            ],
            [
              "Confidence Score a partir da força das evidências, com peso maior para dado de comportamento que para opinião.",
              "Desenvolvimento guiado por evidências e o Confidence Meter, de Itamar Gilad.",
              <span key="2">
                <Ext href="https://itamargilad.com/the-tool-that-will-help-you-choose-better-product-ideas/">ICE e o Confidence Meter</Ext>
                {" · "}
                <Ext href="https://itamargilad.com/book-evidence-guided/">Livro Evidence-Guided</Ext>
              </span>,
            ],
            [
              "Tipos de hipótese que cobrem valor, usabilidade, viabilidade e negócio.",
              "Os riscos de produto (valor, usabilidade, viabilidade técnica e viabilidade de negócio), de Marty Cagan, da SVPG.",
              <Ext key="3" href="https://svpg.com/product-risk-taxonomies">SVPG: product risk taxonomies</Ext>,
            ],
            [
              "Experimentos com critério de sucesso definido antes do resultado; aprender antes de construir.",
              "Lean Startup (construir, medir, aprender), de Eric Ries.",
              <Ext key="4" href="https://www.theleanstartup.com/book">The Lean Startup</Ext>,
            ],
            [
              "Testar primeiro as suposições mais arriscadas, com o experimento mais barato que responda.",
              "Mapeamento de suposições e testes de ideias de negócio, de David J. Bland.",
              <span key="5">
                <Ext href="https://strategyzer.com/test">Testing Business Ideas</Ext>
                {" · "}
                <Ext href="https://strategyzer.com/library/how-assumptions-mapping-can-focus-your-teams-on-running-experiments-that-matter">Assumptions mapping</Ext>
              </span>,
            ],
            [
              "Score de priorização com cinco notas e fator de evidência.",
              "Família de modelos RICE e ICE. O nosso é uma variação: cinco critérios e um multiplicador de evidência.",
              <span key="6">
                <Ext href="https://www.intercom.com/blog/rice-simple-prioritization-for-product-managers">RICE (Intercom)</Ext>
                {" · "}
                <Ext href="https://itamargilad.com/the-tool-that-will-help-you-choose-better-product-ideas/">ICE (Itamar Gilad)</Ext>
              </span>,
            ],
          ]}
        />
        <H3>Leitura complementar</H3>
        <p>Não são a base da ferramenta, mas ajudam a entender os mesmos problemas por outro ângulo:</p>
        <ul className="ml-5 list-disc space-y-1">
          <li>
            <Ext href="https://www.designcouncil.org.uk/our-resources/framework-for-innovation">Double Diamond (Design Council)</Ext>: a ideia de
            abrir o olhar para entender o problema e depois fechar para escolher a solução, duas vezes.
          </li>
          <li>
            <Ext href="https://hbr.org/2016/09/know-your-customers-jobs-to-be-done">Jobs to Be Done (Harvard Business Review)</Ext>: entender o
            “trabalho” que a pessoa quer cumprir, em vez de apenas o que ela pede.
          </li>
          <li>
            <Ext href="https://www.momtestbook.com/">The Mom Test</Ext>: como conduzir conversas com clientes sem induzir as respostas, o mesmo
            cuidado do detector de pergunta tendenciosa.
          </li>
        </ul>
      </Section>

      {/* 9 ----------------------------------------------------------- */}
      <Section id="calendario" title="9. Calendário do projeto: estimado x real">
        <p>
          O <strong>Calendário do projeto</strong> guarda a linha do tempo do Trevo One e mede quanto tempo as coisas realmente levam. Parte dele se
          preenche sozinha; o resto é registro manual.
        </p>
        <ul className="ml-5 list-disc space-y-2">
          <li>
            <strong>Automático:</strong> oportunidades concluídas (com o prazo do Gantt como data prevista), user stories concluídas, pesquisas
            criadas e a janela de respostas, entrevistas, observações de campo, experimentos com resultado e decisões.
          </li>
          <li>
            <strong>Manual:</strong> início do projeto, aceite do piloto, apresentações à diretoria, pedidos a terceiros (ZDI, Animati…) e qualquer
            outro marco. Cada registro tem data, tipo, contraparte, data prevista e anotações.
          </li>
          <li>
            <strong>Pedidos a terceiros:</strong> registre a data do pedido e, quando chegar a resposta, clique em “Foi respondido”. O app calcula a
            espera de cada pedido e a média por contraparte.
          </li>
          <li>
            <strong>Arquivos:</strong> cada registro manual aceita anexos (PDF, PowerPoint, Word, Excel, imagens, áudio, vídeo ou ZIP, até 50 MB
            cada). Por exemplo, o PPT usado na apresentação à diretoria fica guardado na data em que ela aconteceu, para comparar com versões
            seguintes. Abra o registro na linha do tempo para anexar ou baixar.
          </li>
          <li>
            <strong>Estimado x real:</strong> preencha a “data prevista” de um registro, ou defina o prazo das oportunidades no Gantt. A comparação,
            o percentual no prazo e o atraso médio se atualizam sozinhos conforme os registros crescem.
          </li>
        </ul>
        <p>
          O <strong>Gantt</strong> está na aba “Gantt (prazos)” do Discovery Board. Ele mostra as oportunidades enviadas ao Azure DevOps com as
          datas planejadas; quem é Owner ajusta as datas ali mesmo, e o calendário usa essas datas como prazo previsto.
        </p>
        <p className="text-sm text-slate-500">
          Só passam a contar como “real” as datas que já chegaram. A conclusão de user stories só é datada a partir do momento em que a coluna de
          conclusão foi criada; o que foi concluído antes não aparece.
        </p>
      </Section>

      {/* 10 ---------------------------------------------------------- */}
      <Section id="limites" title="10. Limites e cuidados">
        <ul className="ml-5 list-disc space-y-2">
          <li>
            <strong>As cinco notas são julgamento humano.</strong> Duas pessoas podem dar notas diferentes. Combine a régua com a equipe e registre
            a justificativa. Diferenças de centésimos entre dois scores não significam que uma é mais prioritária que a outra.
          </li>
          <li>
            <strong>A confiança vem da hipótese, não da oportunidade.</strong> Todas as oportunidades de uma mesma hipótese herdam o mesmo fator
            de evidência. Se a hipótese for muito ampla, o fator não ajuda a distinguir as oportunidades entre si.
          </li>
          <li>
            <strong>Score não é ordem de construção.</strong> Dependências entre features, risco técnico e compromissos com o cliente também
            entram, por isso a ordem do board pode ser manual.
          </li>
          <li>
            <strong>Pouca evidência dá score baixo, de propósito.</strong> Um Confidence Score abaixo de 70 não quer dizer que a ideia é ruim;
            quer dizer que ainda sabemos pouco.
          </li>
          <li>
            <strong>Os rascunhos de IA precisam de revisão.</strong> Sem a chave da IA configurada, a ferramenta funciona em modo demonstração,
            com respostas ilustrativas marcadas como tal.
          </li>
          <li>
            <strong>Ainda não existe cadastro de Insights.</strong> Hoje a oportunidade nasce direto de uma hipótese. Sem hipótese, é preciso
            descrever o problema observado, para que nenhuma oportunidade fique sem lastro.
          </li>
        </ul>
      </Section>
    </div>
  );
}
