import { requireUser } from "./current-user";
import { requireCurrentProject } from "./current-project";

// Helper usado no topo de quase toda page.tsx autenticada: garante usuário
// logado e projeto atual selecionado, retornando os três juntos.
export async function getPageContext() {
  const user = await requireUser();
  const current = await requireCurrentProject(user.id);
  return { user, project: current.project, role: current.role as "owner" | "editor" | "contributor" | "viewer" };
}
