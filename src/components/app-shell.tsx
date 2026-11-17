"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { TopBar } from "./topbar";

type ProjectRow = { project: { id: string; name: string }; role: string };

// Casca do app, responsiva: a partir de 1024px o menu lateral fica fixo; abaixo
// disso vira uma gaveta aberta pelo botão ☰ da barra de cima. O conteúdo ocupa
// a largura toda da janela (só limitado em telas ultralargas).
export function AppShell({
  user,
  projects,
  current,
  children,
}: {
  user: { name: string; email: string };
  projects: ProjectRow[];
  current: ProjectRow | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  // Fecha a gaveta ao navegar (ajuste de estado durante a renderização, padrão do React).
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setMenuOpen(false);
  }

  return (
    <div className="flex h-dvh overflow-clip bg-slate-50">
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar user={user} projects={projects} current={current} onMenu={() => setMenuOpen(true)} />
        <main className="relative min-h-0 flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6">
          <div className="mx-auto w-full max-w-[1920px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
