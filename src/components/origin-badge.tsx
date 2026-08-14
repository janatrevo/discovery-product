// Componente de proveniência — usado em TODA superfície que exibe conteúdo
// que possa ter sido gerado ou influenciado por IA (seção 13 da especificação).
// Regra de produto: isto nunca é opcional nem removível pelo usuário.

export function OriginBadge({
  originClass,
}: {
  originClass: "real_data" | "inference" | "simulation";
}) {
  if (originClass === "real_data") {
    return <span className="origin-badge-real">● Dado real</span>;
  }
  if (originClass === "inference") {
    return <span className="origin-badge-inference">◆ Inferência</span>;
  }
  return <span className="origin-badge-simulation">▲ Simulação de IA</span>;
}

export function SimulationBanner({ mode }: { mode?: "scenario" | "image" }) {
  return (
    <div className="simulation-banner">
      <strong>Isto é uma simulação de IA</strong> para fins exploratórios
      {mode === "image" ? " sobre a imagem enviada" : " de como esta persona reagiria"}. Não
      representa dados reais de usuários e não deve ser citado como validação de mercado. Use para
      levantar hipóteses e preparar pesquisa real — nunca como substituto dela.
    </div>
  );
}
