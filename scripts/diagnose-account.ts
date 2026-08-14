/**
 * Diagnóstico de conta/projeto — não altera nada no banco, só lê e imprime.
 * Ajuda a entender o erro "Nenhum projeto disponível para este usuário.":
 * lista todos os usuários, todas as organizações/projetos, e para o e-mail
 * informado, mostra exatamente quais vínculos (project_memberships) existem.
 *
 * Uso: node --env-file-if-exists=.env.local --env-file-if-exists=.env --import tsx scripts/diagnose-account.ts seu-email@exemplo.com
 */
import { db } from "../src/db";
import { eq } from "drizzle-orm";
import { users, projects, organizations, projectMemberships } from "../src/db/schema";

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.log("Uso: ... scripts/diagnose-account.ts seu-email@exemplo.com");
    process.exit(1);
  }

  console.log(`\n=== Todos os usuários no banco ===`);
  const allUsers = await db.select().from(users);
  for (const u of allUsers) {
    console.log(`- ${u.email}  (id: ${u.id})  criado em ${u.createdAt}`);
  }

  console.log(`\n=== Todas as organizações e projetos ===`);
  const allOrgs = await db.select().from(organizations);
  const allProjects = await db.select().from(projects);
  for (const o of allOrgs) {
    console.log(`Organização "${o.name}" (id: ${o.id})`);
    for (const p of allProjects.filter((p) => p.organizationId === o.id)) {
      console.log(`  -> Projeto "${p.name}" (id: ${p.id})`);
    }
  }
  const orphanProjects = allProjects.filter((p) => !p.organizationId);
  if (orphanProjects.length > 0) {
    console.log(`Projetos sem organização:`);
    for (const p of orphanProjects) {
      console.log(`  -> Projeto "${p.name}" (id: ${p.id})`);
    }
  }

  console.log(`\n=== Buscando usuário com e-mail "${email}" ===`);
  const [target] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!target) {
    console.log(`Nenhum usuário encontrado com esse e-mail. Verifique se digitou certo.`);
    process.exit(0);
  }
  console.log(`Encontrado: ${target.name} <${target.email}> (id: ${target.id})`);

  console.log(`\n=== Vínculos (project_memberships) desse usuário ===`);
  const memberships = await db
    .select({ membership: projectMemberships, project: projects })
    .from(projectMemberships)
    .innerJoin(projects, eq(projects.id, projectMemberships.projectId))
    .where(eq(projectMemberships.userId, target.id));

  if (memberships.length === 0) {
    console.log(`NENHUM vínculo encontrado — é exatamente por isso que a aplicação mostra "Nenhum projeto disponível".`);
  } else {
    for (const m of memberships) {
      console.log(`- Projeto "${m.project.name}" (id: ${m.project.id}) — papel: ${m.membership.role}`);
    }
  }

  console.log(`\nConcluído.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Erro ao diagnosticar:", err);
    process.exit(1);
  });
