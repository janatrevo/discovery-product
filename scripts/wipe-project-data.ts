/**
 * Apaga todos os cadastros (dados de negócio) de UM projeto específico,
 * mantendo o projeto em si, os usuários e os vínculos de equipe
 * (project_memberships) intactos — ou seja, você continua logada, com
 * acesso ao mesmo projeto, só que vazio, pronto para receber dados reais.
 *
 * NÃO apaga: users, organizations, projects, project_memberships.
 * Apaga (em cascata, na ordem certa pra não esbarrar em foreign keys):
 * decisions, simulation_runs (+ respostas), usability_tests (+ assets,
 * personas ligadas, findings), interviews, surveys (+ perguntas,
 * respostas), interview_guides (+ perguntas), experiments, codes (+
 * segmentos codificados), opportunities (+ product_docs, user_stories),
 * insights (+ vínculos), evidence, hypotheses (+ vínculos, histórico),
 * personas (+ versões), products (+ assets), comments (+ menções),
 * pattern_analyses, reports.
 *
 * SEMPRE roda em modo "dry run" (só mostra o que seria apagado) a não ser
 * que você passe --confirmar. Isso é proposital: rodar sem --confirmar
 * primeiro é a forma de conferir a contagem antes de apagar de verdade.
 *
 * Uso (precisa do --env-file-if-exists, senão DATABASE_URL não é carregada —
 * "npm run dev" carrega .env.local automaticamente porque isso é uma
 * particularidade do Next.js; rodar um script solto com "npx tsx" não):
 *   node --env-file-if-exists=.env.local --import tsx scripts/wipe-project-data.ts "Nome exato do projeto"
 *   node --env-file-if-exists=.env.local --import tsx scripts/wipe-project-data.ts "Nome exato do projeto" --confirmar
 */
import { db } from "../src/db";
import { eq } from "drizzle-orm";
import {
  projects,
  decisions,
  simulationRuns,
  usabilityTests,
  interviews,
  surveys,
  interviewGuides,
  experiments,
  codes,
  opportunities,
  insights,
  evidence,
  hypotheses,
  personas,
  products,
  comments,
  patternAnalyses,
  reports,
} from "../src/db/schema";

// Ordem importa: cada tabela aqui precisa ser apagada ANTES de qualquer
// tabela que ela referencia sem cascade automático (ex.: opportunities
// referencia hypotheses/personas/insights/evidence sem cascade — por isso
// opportunities vem antes dessas quatro). Ver comentário no topo do
// arquivo para o raciocínio completo de cada dependência.
const TABLES_IN_DELETE_ORDER = [
  { label: "decisions", table: decisions },
  { label: "simulation_runs (+ respostas)", table: simulationRuns },
  { label: "usability_tests (+ assets/personas/findings)", table: usabilityTests },
  { label: "interviews", table: interviews },
  { label: "surveys (+ perguntas/respostas)", table: surveys },
  { label: "interview_guides (+ perguntas)", table: interviewGuides },
  { label: "experiments", table: experiments },
  { label: "codes (+ segmentos codificados)", table: codes },
  { label: "opportunities (+ product_docs/user_stories)", table: opportunities },
  { label: "insights (+ vínculos)", table: insights },
  { label: "evidence (+ vínculos)", table: evidence },
  { label: "hypotheses (+ vínculos/histórico)", table: hypotheses },
  { label: "personas (+ versões)", table: personas },
  { label: "products (+ assets)", table: products },
  { label: "comments (+ menções)", table: comments },
  { label: "pattern_analyses", table: patternAnalyses },
  { label: "reports", table: reports },
] as const;

async function countAll(projectId: string) {
  const counts: { label: string; count: number }[] = [];
  for (const { label, table } of TABLES_IN_DELETE_ORDER) {
    const rows = await db.select().from(table).where(eq(table.projectId, projectId));
    counts.push({ label, count: rows.length });
  }
  return counts;
}

async function main() {
  const projectName = process.argv[2];
  const confirm = process.argv.includes("--confirmar");

  if (!projectName) {
    console.log('Uso: npx tsx scripts/wipe-project-data.ts "Nome exato do projeto" [--confirmar]');
    process.exit(1);
  }

  const matches = await db.select().from(projects).where(eq(projects.name, projectName));
  if (matches.length === 0) {
    console.log(`Nenhum projeto encontrado com o nome exato "${projectName}". Confira maiúsculas/acentos.`);
    process.exit(1);
  }
  if (matches.length > 1) {
    console.log(`Encontrei ${matches.length} projetos com esse nome — apague manualmente ou ajuste o script pra usar o id:`);
    for (const p of matches) console.log(`  - id: ${p.id}`);
    process.exit(1);
  }
  const project = matches[0];

  console.log(`\nProjeto alvo: "${project.name}" (id: ${project.id})\n`);
  const counts = await countAll(project.id);
  let total = 0;
  for (const c of counts) {
    console.log(`  ${c.label.padEnd(45)} ${c.count}`);
    total += c.count;
  }
  console.log(`\nTotal de registros que seriam apagados: ${total}`);

  if (!confirm) {
    console.log(`\nMODO DE CONFERÊNCIA (dry run) — nada foi apagado.`);
    console.log(`Se a contagem acima está certa, rode de novo adicionando --confirmar no final.`);
    process.exit(0);
  }

  if (total === 0) {
    console.log(`\nNão há nada para apagar neste projeto.`);
    process.exit(0);
  }

  console.log(`\n--confirmar detectado. Apagando de verdade em 1 transação...`);
  await db.transaction(async (tx) => {
    for (const { label, table } of TABLES_IN_DELETE_ORDER) {
      const deleted = await tx.delete(table).where(eq(table.projectId, project.id)).returning();
      console.log(`  apagado: ${label.padEnd(45)} ${deleted.length}`);
    }
  });

  const after = await countAll(project.id);
  const remaining = after.reduce((sum, c) => sum + c.count, 0);
  if (remaining === 0) {
    console.log(`\nConcluído. O projeto "${project.name}" está vazio — projeto, usuários e vínculos de equipe continuam intactos.`);
  } else {
    console.log(`\nATENÇÃO: sobraram ${remaining} registros — confira manualmente:`);
    for (const c of after.filter((c) => c.count > 0)) console.log(`  ${c.label}: ${c.count}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Erro:", err.message || err);
    process.exit(1);
  });
