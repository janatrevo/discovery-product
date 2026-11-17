# Regras do projeto

## Layout (premissa: usar a tela toda, em qualquer tamanho)

- As páginas ocupam a largura toda da janela. **Não** coloque `max-w-*` na raiz de uma página
  (o `AppShell` já limita só em telas ultralargas, 1920px). Textos corridos longos são a exceção
  (ex.: página de documentação, páginas públicas `app/s/[slug]`).
- Organize o conteúdo por breakpoint, nunca com largura fixa:
  - **Lista de cards** → `<div className="card-grid">` (1 coluna no celular, 2, 3... conforme a largura).
  - **Página de detalhe com vários blocos** → `<div className="page-masonry">` (2 colunas a partir de 1280px;
    o `PageHeader` já ocupa a linha toda; use `page-span` num filho que deva ocupar as 2 colunas).
  - **Formulário** → `<form className="form-cols">` (2 colunas a partir de 1024px; textareas e botões ocupam a linha toda).
  - Grades de cards fixos (personas, produtos): `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4`.
- Responsivo primeiro: tudo precisa funcionar a 360px de largura. Menu lateral vira gaveta abaixo de 1024px
  (`components/app-shell.tsx`). Barras de ações usam `flex-wrap`; tabelas largas ficam dentro de `overflow-x-auto`.
- Campos de texto longos usam `Textarea` de `components/ui` (cresce sozinho conforme o conteúdo).
