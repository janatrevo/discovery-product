/**
 * Remove os dados de demonstração criados pelo seed (organização, projeto,
 * personas, hipóteses etc. de "Trevo Saúde App" / demo@trevosaude.com.br),
 * preservando qualquer conta real já criada (ex.: via convite de admin).
 * Garante que toda conta real preservada fique com pelo menos um projeto
 * próprio (cria um projeto vazio "Discovery" se ela não tiver nenhum).
 *
 * Uso: npm run reset-demo
 */
import { db } from "../src/db";
import { eq } from "drizzle-orm";
import { organizations, users, projects, projectMemberships } from "../src/db/schema";

const DEMO_EMAIL = "demo@trevosaude.com.br";

async function main() {
  const [demoUser] = await db.select().from(users).where(eq(users.email, DEMO_EMAIL)).limit(1);

  if (demoUser) {
    const demoProjects = await db.select().from(projects).where(eq(projects.createdBy, demoUser.id));
    const orgIds = [...new Set(demoProjects.map((p) => p.organizationId).filter((v): v is string => Boolean(v)))];
    for (const orgId of orgIds) {
      // Cascata (ver src/db/schema.ts): organização -> projeto -> tudo mais
      // (personas, hipóteses, evidências, testes, etc.).
      await db.delete(organizations).where(eq(organizations.id, orgId));
    }
    await db.delete(users).where(eq(users.id, demoUser.id));
    console.log(`Removidos: usuário demo (${DEMO_EMAIL}) e ${orgIds.length} organização(ões) de demonstração.`);
  } else {
    console.log("Nenhum usuário de demonstração encontrado — nada a remover.");
  }

  const remainingUsers = await db.select().from(users);
  for (const u of remainingUsers) {
    const [membership] = await db
      .select()
      .from(projectMemberships)
      .where(eq(projectMemberships.userId, u.id))
      .limit(1);
    if (!membership) {
      const [org] = await db.insert(organizations).values({ name: "Trevo Saúde" }).returning();
      const [project] = await db
        .insert(projects)
        .values({
          organizationId: org.id,
          name: "Discovery",
          description: "Projeto real — criado automaticamente para a conta administrativa após a limpeza dos dados de demonstração.",
          createdBy: u.id,
        })
        .returning();
      await db.insert(projectMemberships).values({ projectId: project.id, userId: u.id, role: "owner" });
      console.log(`Criado projeto novo "Discovery" para ${u.email} (papel: owner).`);
    }
  }

  console.log("Concluído.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Erro ao limpar dados de demonstração:", err);
    process.exit(1);
  });
