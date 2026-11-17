import { redirect } from "next/navigation";
import { requireUser } from "@/lib/current-user";
import { listUserProjects, getCurrentProject } from "@/lib/current-project";
import { AppShell } from "@/components/app-shell";
import { ProductTourProvider } from "@/components/product-tour";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  // Senha temporária: só libera o app depois de trocar a senha.
  if (user.mustChangePassword) redirect("/trocar-senha");
  const [projectsList, current] = await Promise.all([
    listUserProjects(user.id),
    getCurrentProject(user.id),
  ]);

  return (
    <ProductTourProvider>
      <AppShell user={user} projects={projectsList} current={current}>
        {children}
      </AppShell>
    </ProductTourProvider>
  );
}
