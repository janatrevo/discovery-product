# Testes E2E (Playwright)

Suíte de teste de ponta a ponta contra o app real rodando localmente
(`npm run dev`) e o banco Supabase real configurado em `.env.local`. Roda no
navegador de verdade (Chromium), simulando o que uma pessoa faria na tela.

## Rodando (uma vez, para instalar)

```
npm install -D @playwright/test
npx playwright install chromium
```

## Rodando os testes

```
npm run test:e2e
```

Se o `npm run dev` já não estiver rodando, o Playwright sobe ele
automaticamente antes dos testes (configurado em `playwright.config.ts`).

Para ver o relatório visual (screenshots de qualquer falha):

```
npm run test:e2e:report
```

## O que está cobrto (e o que não está)

Cobre as regras mais críticas do produto, não todas as telas:

- **Autenticação**: signup cria conta/organização/projeto e já loga; senha
  errada é rejeitada; visitar página protegida deslogado redireciona para
  `/login`; logout de verdade encerra a sessão (não só a tela).
- **Permissão por papel**: um membro `viewer` não vê os controles de editar
  configurações do projeto nem de convidar gente — a UI omite esses
  controles, não é só o servidor recusando por trás.
- **Confidence Score**: hipótese nova começa em 0; adicionar uma evidência
  real favorável e forte aumenta o score (a regra central do produto:
  confiança vem de evidência real, não de opinião).
- **Painel multi-persona**: rodar uma simulação com 2 personas mostra as
  duas lado a lado, gera a síntese de consenso/divergência, e — regra que
  não pode falhar nunca — toda resposta simulada aparece com o aviso
  "simulação — não é evidência real".
- **Upload de usabilidade → Supabase Storage**: subir uma imagem de teste de
  usabilidade sobe para o Storage (não mais para disco local) e a imagem
  volta via URL assinada do Supabase.
- **Produtos/Conceitos**: criar um produto redireciona para o detalhe e ele
  aparece na listagem.
- **Personas**: criar uma persona sintética funciona sem exigir fonte; marcar
  uma persona como "research-based" sem nenhuma fonte informada é bloqueado
  (regra estrutural do produto — não dá para alegar base em pesquisa sem
  apontar de onde veio).
- **Oportunidades (Discovery Board)**: mapear uma oportunidade sem hipótese
  vinculada e sem referência do problema é bloqueado; com referência do
  problema preenchida, é permitido mesmo sem hipótese.
- **Decision Log**: registrar uma decisão sem hipóteses/evidências
  referenciadas é bloqueado, a menos que a pessoa marque explicitamente que
  está sobrepondo a metodologia recomendada.
- **Surveys**: criar um survey e adicionar uma pergunta ao questionário.
- **Entrevistas**: criar um roteiro, registrar uma entrevista e conferir que
  a transcrição aparece na página de detalhe.

O que **não** está cobrto por esta suíte (ficou de fora por escopo/tempo):
Reports, Research Repository (detecção de padrões), PRD & User Stories, o
ciclo de resultado pós-lançamento, e os detalhes exatos da fórmula do
Confidence Score (o teste confirma que ele aumenta com evidência real, não
os números exatos esperados). Se quiser, posso estender a suíte para esses
módulos depois.

## Nota sobre módulos de IA

Os testes de simulação/usabilidade funcionam tanto com `GEMINI_API_KEY`
configurada (IA real) quanto sem ela (modo demo) — a regra testada é que o
aviso de simulação aparece sempre, não que a IA seja real. Com a chave real
configurada, as chamadas à API do Gemini podem demorar alguns segundos; os
timeouts dos testes já contam com isso.
