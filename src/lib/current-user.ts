import { redirect } from "next/navigation";
import { db } from "@/db";
import { users, projectMemberships } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getSessionUserId } from "./auth";

export async function getCurrentUser() {
  const userId = await getSessionUserId();
  if (!userId) return null;
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return user ?? null;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export type ProjectRole = "owner" | "editor" | "contributor" | "viewer";

const ROLE_RANK: Record<ProjectRole, number> = {
  viewer: 0,
  contributor: 1,
  editor: 2,
  owner: 3,
};

export async function getProjectRole(userId: string, projectId: string): Promise<ProjectRole | null> {
  const [m] = await db
    .select()
    .from(projectMemberships)
    .where(and(eq(projectMemberships.projectId, projectId), eq(projectMemberships.userId, userId)))
    .limit(1);
  return (m?.role as ProjectRole) ?? null;
}

export function roleAtLeast(role: ProjectRole | null, min: ProjectRole) {
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

export async function requireProjectRole(userId: string, projectId: string, min: ProjectRole) {
  const role = await getProjectRole(userId, projectId);
  if (!roleAtLeast(role, min)) {
    throw new Error("Sem permissão suficiente neste projeto.");
  }
  return role as ProjectRole;
}
