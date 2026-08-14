// Converte um textarea "um item por linha" em array de strings (usado nos
// campos de tags de Persona/Produto: dores, objetivos, features etc.).
export function linesToArray(value: FormDataEntryValue | null | undefined): string[] {
  if (!value || typeof value !== "string") return [];
  return value
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function arrayToLines(value: string[] | null | undefined): string {
  return (value ?? []).join("\n");
}
