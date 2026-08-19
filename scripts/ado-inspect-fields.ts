/**
 * Diagnóstico (só leitura) do Azure DevOps — lista todos os campos
 * configurados no tipo de work item "Feature" do projeto (AZURE_DEVOPS_*,
 * de .env.local), com o "referenceName" exato de cada um.
 *
 * Você disse que Business Rules, Acceptance Criteria e Success Metrics já
 * estão configurados como campos no processo do Azure DevOps — preciso do
 * referenceName exato de cada um (ex.: "Microsoft.VSTS.Common.AcceptanceCriteria"
 * ou um nome customizado tipo "Custom.BusinessRules") pra programar a
 * integração usando os campos de verdade, em vez de adivinhar.
 *
 * Uso: npx tsx scripts/ado-inspect-fields.ts
 * (ou: node --env-file-if-exists=.env.local --import tsx scripts/ado-inspect-fields.ts)
 */

const ORG = process.env.AZURE_DEVOPS_ORG;
const PROJECT = process.env.AZURE_DEVOPS_PROJECT;
const PAT = process.env.AZURE_DEVOPS_PAT;

async function main() {
  if (!ORG || !PROJECT || !PAT) {
    console.error("Faltam AZURE_DEVOPS_ORG / AZURE_DEVOPS_PROJECT / AZURE_DEVOPS_PAT no .env.local.");
    process.exit(1);
  }

  const auth = Buffer.from(`:${PAT}`).toString("base64");
  const url = `https://dev.azure.com/${encodeURIComponent(ORG)}/${encodeURIComponent(
    PROJECT
  )}/_apis/wit/workitemtypes/Feature?api-version=7.1`;

  const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
  if (!res.ok) {
    console.error(`Falha (HTTP ${res.status}):`, await res.text());
    process.exit(1);
  }

  const body = await res.json();
  const fields: { referenceName: string; name: string; alwaysRequired?: boolean }[] = body.fieldInstances || [];

  console.log(`\n=== Campos do tipo "Feature" no projeto "${PROJECT}" (${fields.length} campos) ===\n`);
  for (const f of fields.sort((a, b) => a.name.localeCompare(b.name))) {
    console.log(`${f.name.padEnd(35)} -> ${f.referenceName}${f.alwaysRequired ? "  (obrigatório)" : ""}`);
  }

  console.log(`\n=== Procurando pelos nomes específicos que preciso ===`);
  const targets = ["business rule", "acceptance criteria", "success metric"];
  for (const t of targets) {
    const matches = fields.filter((f) => f.name.toLowerCase().includes(t));
    if (matches.length === 0) {
      console.log(`- Nada encontrado contendo "${t}" no nome.`);
    } else {
      for (const m of matches) console.log(`- "${m.name}" -> ${m.referenceName}`);
    }
  }
}

main().catch((err) => {
  console.error("Erro:", err.message || err);
  process.exit(1);
});
