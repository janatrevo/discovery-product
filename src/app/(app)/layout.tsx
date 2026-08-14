import { requireUser } from "@/lib/current-user";
import { listUserProjects, getCurrentProject } from "@/lib/current-project";
import { Sidebar } from "@/components/sidebar";
import { TopBar } from "@/components/topbar";
import { ProductTourProvider } from "@/components/product-tour";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [projectsList, current] = await Promise.all([
    listUserProjects(user.id),
    getCurrentProject(user.id),
  ]);

  return (
    <ProductTourProvider>
      <div className="flex h-screen overflow-hidden bg-slate-50">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar user={user} projects={projectsList} current={current} />
          <main className="flex-1 overflow-y-auto p-6">{children}</main>
        </div>
      </div>
    </ProductTourProvider>
  );
}
