# Trevo Discovery — Product Discovery & Hypothesis Validation Platform

Plataforma para levar disciplina científica ao discovery de produto: toda
crença do time vira uma **hipótese** rastreável, toda evidência tem uma
**origem declarada** (dado real vs. simulação de IA), e o **Confidence
Score** que decide se uma hipótese está validada é calculado por uma
fórmula determinística — nunca por um modelo de linguagem.

Construído em Next.js 16 (App Router, Server Actions) + Drizzle ORM +
Postgres, pronto para deploy em Vercel + Supabase.

## Por que este projeto existe

A maior parte das ferramentas de discovery com IA embutida tem um risco
estrutural: é fácil a IA "confirmar" uma hipótese com uma simulação de
persona que parece plausível, mas não é dado real. Esta plataforma trata
isso como o problema central do produto, não como um detalhe de UX:

- **Simulação nunca conta como evidência.** Estruturalmente — não é uma
  regra de negócio que pode ser contornada, é uma separação de dados
  (`origin_class: real_data | inference | simulation`) que o cálculo de
  confiança filtra antes mesmo de rodar.
- **O Confidence Score é uma fórmula auditável, não uma opinião de IA.** Ver
  `src/lib/confidence.ts` — cada hipótese tem um "recibo" mostrando
  exatamente como o número foi calculado (peso do método, recência,
  tamanho de amostra, qualidade, confiabilidade, diversidade de fontes).
- **Toda transição de status pode ser sobrescrita manualmente — mas isso
  fica registrado para sempre.** Ver `src/lib/hypothesis-status.ts` e o
  histórico append-only em `hypothesis_history`.

## Módulos incluídos

| Módulo | Onde |
|---|---|
| Hipóteses (entidade central, kanban por status) | `/hypotheses` |
| Personas (research-based e sintéticas, marcadas) | `/personas` |
| Produtos & Conceitos | `/products` |
| Evidência + Confidence Score + recibo de cálculo | dentro de cada hipótese |
| Experimentos (critério de sucesso travado antes do resultado) | `/experiments` |
| Surveys quantitativos (com detector de pergunta tendenciosa) | `/research/surveys` |
| Entrevistas qualitativas + codificação (sugestão por IA, confirmação humana) | `/research/interviews` |
| Testes de usabilidade / análise de imagem por IA | `/usability` |
| Persona Simulation Engine (cenários simulados por IA) | `/simulations` |
| Research Repository (toda evidência do projeto, com filtros) | `/repository` |
| Discovery Board (oportunidades priorizadas) | `/opportunities` |
| Decision Log (append-only, com flag de override de metodologia) | `/decisions` |
| Reports (snapshot do projeto, exportável em Markdown) | `/reports` |
| Página pública de survey (sem login) | `/s/[slug]` |

Todos os módulos de IA (`src/lib/ai.ts`) rodam em **modo demo** quando
`ANTHROPIC_API_KEY` não está configurada: respostas ilustrativas, geradas
localmente, sempre marcadas (`[MODO DEMO]`, badge de simulação) — nenhuma
funcionalidade quebra sem a chave, e nada é apresentado como dado real por
engano.

## Stack

- **Next.js 16** (App Router, Turbopack, Server Actions nativas)
- **Drizzle ORM** + `postgres` (conexão direta — funciona contra Postgres
  local ou Supabase sem mudança de código, ver `MIGRATING_TO_SUPABASE.md`)
- **Autenticação própria** (bcrypt + JWT via `jose` + cookie httpOnly) —
  RBAC por projeto (`owner` / `editor` / `contributor` / `viewer`)
- **@anthropic-ai/sdk** com fallback de mock determinístico
- **Tailwind CSS 4**

## Rodando localmente

### 1. Pré-requisitos

- Node.js 20+
- Um Postgres acessível (local ou já um projeto Supabase)

### 2. Instalar dependências

```bash
npm install
```

### 3. Configurar variáveis de ambiente

```bash
cp .env.example .env.local
```

Edite `.env.local` com sua `DATABASE_URL`. Para desenvolvimento local rápido
com um Postgres na própria máquina:

```bash
# Exemplo com Postgres já instalado localmente
createdb discovery_dev
# DATABASE_URL=postgres://postgres:postgres@localhost:5432/discovery_dev
```

`ANTHROPIC_API_KEY` é opcional — sem ela, os módulos de IA funcionam em modo
demo (ver acima).

### 4. Aplicar o schema no banco

```bash
npx drizzle-kit push
```

(`push` aplica o schema diretamente, sem gerar arquivo de migration — bom
para desenvolvimento. Para produção/CI, prefira `npm run db:migrate` usando
as migrations versionadas em `supabase/migrations/`.)

### 5. Popular com dados demo (recomendado)

```bash
npm run seed
```

Isso cria um projeto fictício completo — "Trevo Saúde App" — cobrindo todos
os módulos: hipóteses em diferentes estágios (incluindo uma validada com 4
fontes de evidência convergentes, uma invalidada e depois sobrescrita
manualmente com justificativa, uma ainda em investigação), personas,
produtos, experimentos, survey com pergunta tendenciosa sinalizada,
entrevista com codificação, teste de usabilidade com análise por IA,
simulação de persona, oportunidades priorizadas, decisões registradas e um
relatório gerado.

**Atenção:** este comando é destrutivo — apaga todo o conteúdo de negócio
do banco antes de semear. Não rode contra um banco com dados reais.

Login demo criado pelo seed:

```
E-mail: demo@trevosaude.com.br
Senha:  Demo@2026!
```

### 6. Rodar o servidor de desenvolvimento

```bash
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000).

## Deploy em produção (Vercel + Supabase)

Guia completo em **[`MIGRATING_TO_SUPABASE.md`](./MIGRATING_TO_SUPABASE.md)**.
Resumo:

1. Crie um projeto no [Supabase](https://supabase.com) e copie a
   `DATABASE_URL`.
2. Rode `npx drizzle-kit migrate` contra ela (aplica as migrations em
   `supabase/migrations/`).
3. Importe o repositório no [Vercel](https://vercel.com/new), configure as
   variáveis de ambiente (`DATABASE_URL`, `AUTH_SECRET`, opcionalmente
   `ANTHROPIC_API_KEY`) e faça deploy — é um app Next.js padrão, sem
   configuração extra de build.
4. Antes de aceitar uploads de imagem em produção, implemente o Supabase
   Storage conforme o item 2 de `MIGRATING_TO_SUPABASE.md` (o armazenamento
   local em disco usado em dev não funciona em ambiente serverless).

## Estrutura do projeto

```
src/
  db/schema.ts            # Schema Drizzle — espelha o modelo de dados da spec
  lib/
    confidence.ts         # Fórmula do Confidence Score (determinística)
    hypothesis-status.ts  # Motor de transição de status
    recompute-hypothesis.ts
    bias-check.ts         # Detector de pergunta tendenciosa em surveys
    ai.ts                 # Módulo central de IA — com fallback de mock
    priority-score.ts     # Score de priorização do Discovery Board
  app/(app)/...            # Todas as rotas autenticadas
  app/(auth)/...           # Login / signup
  app/s/[slug]/...         # Página pública de survey
scripts/seed.ts            # Seed de dados demo
supabase/migrations/       # Migrations SQL versionadas (Drizzle Kit)
MIGRATING_TO_SUPABASE.md   # Guia de migração Postgres local → Supabase
```

## Limitações conhecidas / próximos passos

Este é o escopo construído com o máximo de módulos possível dentro do
tempo disponível, priorizando profundidade na arquitetura central
(hipótese → evidência → confiança → status → decisão) sobre superfície de
todos os módulos secundários da especificação original. Ficaram fora
(schema já existe, UI não foi construída):

- CRUD de **Insights** como entidade independente (hoje oportunidades podem
  nascer direto de uma hipótese, sem passar por um Insight formal).
- Colaboração (comentários/menções) — schema existe (`comments`,
  `mentions`), sem UI.
- Upload de assets de produto (schema `product_assets` existe, sem UI de
  upload — só imagens de teste de usabilidade têm upload implementado).
- Row Level Security no Postgres — hoje o isolamento é garantido na camada
  de aplicação (ver seção 4 de `MIGRATING_TO_SUPABASE.md` para o caminho se
  for expor o banco a acesso direto do client).
# discovery-product
