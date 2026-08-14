import { cookies } from "next/headers";
import { db } from "@/db";
import { projects, projectMemberships } from "@/db/schema";
import { eq, and } from "drizzle-orm";

const PROJECT_COOKIE = "discovery_current_project";

export async function listUserProjects(userId: string) {
  return db
    .select({ project: projects, role: projectMemberships.role })
    .from(projectMemberships)
    .innerJoin(projects, eq(projects.id, projectMemberships.projectId))
    .where(eq(projectMemberships.userId, userId));
}

export async function getCurrentProject(userId: string) {
  const store = await cookies();
  const cookieProjectId = store.get(PROJECT_COOKIE)?.value;
  const memberships = await listUserProjects(userId);

  if (cookieProjectId) {
    const found = memberships.find((m) => m.project.id === cookieProjectId);
    if (found) return found;
  }
  return memberships[0] ?? null;
}

export async function setCurrentProjectCookie(projectId: string) {
  const store = await cookies();
  store.set(PROJECT_COOKIE, projectId, { path: "/", maxAge: 60 * 60 * 24 * 365 });
}

export async function requireCurrentProject(userId: string) {
  const current = await getCurrentProject(userId);
  if (!current) {
    // Não deveria acontecer no MVP (todo signup ganha um projeto), mas cobre
    // o caso de o usuário ter saído de todos os projetos.
    throw new Error("Nenhum projeto disponível para este usuário.");
  }
  return current;
}

export async function assertMinRole(
  userId: string,
  projectId: string,
  min: "owner" | "editor" | "contributor" | "viewer"
) {
  const [m] = await db
    .select()
    .from(projectMemberships)
    .where(and(eq(projectMemberships.projectId, projectId), eq(projectMemberships.userId, userId)))
    .limit(1);
  const rank = { viewer: 0, contributor: 1, editor: 2, owner: 3 };
  if (!m || rank[m.role as keyof typeof rank] < rank[min]) {
    throw new Error("Sem permissão suficiente neste projeto.");
  }
}
