/**
 * Restaura o vínculo (project_memberships) de um usuário a um projeto
 * existente, caso tenha sido removido por engano (ex.: bug do removeMember
 * que permitia remover o último Owner — já corrigido). Não cria projeto
 * novo nem apaga nada: só reconecta a conta ao projeto existente (com todos
 * os dados já lá), como Owner.
 *
 * Uso:
 *   node --env-file-if-exists=.env.local --env-file-if-exists=.env --import tsx scripts/restore-membership.ts seu-email@exemplo.com [idDoProjeto]
 *
 * Se [idDoProjeto] não for informado, tenta achar projetos criados por essa
 * conta (createdBy). Se você foi convidada para um projeto criado por outra
 * conta (ex.: a conta de demonstração inicial), passe o id do projeto —
 * pegue com scripts/diagnose-account.ts.
 */
import { db } from "../src/db";
import { eq, and } from "drizzle-orm";
import { users, projects, projectMemberships } from "../src/db/schema";

async function main() {
  const email = process.argv[2];
  const explicitProjectId = process.argv[3];
  if (!email) {
    console.log("Uso: ... scripts/restore-membership.ts seu-email@exemplo.com [idDoProjeto]");
    process.exit(1);
  }

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) {
    console.log(`Nenhum usuário encontrado com o e-mail "${email}".`);
    process.exit(1);
  }
  console.log(`Usuário encontrado: ${user.name} <${user.email}> (id: ${user.id})`);

  const existingMemberships = await db
    .select()
    .from(projectMemberships)
    .where(eq(projectMemberships.userId, user.id));
  if (existingMemberships.length > 0) {
    console.log(
      `Esta conta já tem ${existingMemberships.length} vínculo(s) de projeto — nada para restaurar. ` +
        `Se o erro "Nenhum projeto disponível" ainda aparecer, pode ser outra causa; me avise.`
    );
    process.exit(0);
  }

  let targetProjects;
  if (explicitProjectId) {
    const [p] = await db.select().from(projects).where(eq(projects.id, explicitProjectId)).limit(1);
    if (!p) {
      console.log(`Nenhum projeto encontrado com o id "${explicitProjectId}".`);
      process.exit(1);
    }
    targetProjects = [p];
  } else {
    targetProjects = await db.select().from(projects).where(eq(projects.createdBy, user.id));
    if (targetProjects.length === 0) {
      console.log(
        `Não encontrei nenhum projeto criado por esta conta (createdBy = ${user.id}). ` +
          `Rode scripts/diagnose-account.ts para ver todos os projetos existentes, pegue o id do seu projeto ` +
          `e rode este script de novo passando o id como segundo argumento.`
      );
      process.exit(1);
    }
  }

  for (const project of targetProjects) {
    const [already] = await db
      .select()
      .from(projectMemberships)
      .where(and(eq(projectMemberships.projectId, project.id), eq(projectMemberships.userId, user.id)))
      .limit(1);
    if (already) continue;
    await db.insert(projectMemberships).values({ projectId: project.id, userId: user.id, role: "owner" });
    console.log(`Restaurado: ${user.email} agora é Owner de novo do projeto "${project.name}" (id: ${project.id}).`);
  }

  console.log("Concluído. Recarregue a aplicação — o projeto e todos os dados devem aparecer normalmente.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Erro ao restaurar vínculo:", err);
    process.exit(1);
  });
