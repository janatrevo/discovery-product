// Imagens de apoio das oportunidades (fluxogramas do processo). Ficam no banco
// (opportunity_images) e vão ao Azure DevOps como anexo e dentro da Description.
export const IMAGE_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};
// A Vercel aceita até ~4,5 MB por requisição; deixamos folga para o restante do formulário.
export const MAX_IMAGE_BYTES = 4_000_000;
export const MAX_IMAGES_PER_OPPORTUNITY = 20;

// "Convenios_fluxo_2_decisao_na_marcacao.png" -> "Convenios fluxo 2 decisao na marcacao"
export function titleFromFileName(name: string) {
  return name
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}
