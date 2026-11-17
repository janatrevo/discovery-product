"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { Menu } from "lucide-react";
import { Spinner } from "@/components/ui/button";

type ProjectRow = { project: { id: string; name: string }; role: string };

export function TopBar({
  user,
  projects,
  current,
  onMenu,
}: {
  user: { name: string; email: string };
  projects: ProjectRow[];
  current: ProjectRow | null;
  onMenu?: () => void;
}) {
  const router = useRouter();
  const [switching, setSwitching] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  async function onSwitch(projectId: string) {
    setSwitching(true);
    await fetch("/api/project/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId }),
    });
    setSwitching(false);
    router.refresh();
  }

  async function onLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } catch {
      setLoggingOut(false);
    }
  }

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 sm:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={onMenu}
          className="-ml-1 rounded-md p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
          aria-label="Abrir menu"
        >
          <Menu size={20} />
        </button>
        <span className="hidden text-xs text-slate-400 sm:inline">Projeto:</span>
        <select
          disabled={switching}
          value={current?.project.id ?? ""}
          onChange={(e) => onSwitch(e.target.value)}
          className="min-w-0 max-w-[45vw] truncate rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-sm font-medium text-slate-700 sm:max-w-xs"
        >
          {projects.map((p) => (
            <option key={p.project.id} value={p.project.id}>
              {p.project.name}
            </option>
          ))}
        </select>
        {current && (
          <span className="hidden rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium capitalize text-slate-500 sm:inline">
            {current.role}
          </span>
        )}
        <Link href="/settings/projects/new" className="ml-1 hidden text-xs font-medium text-indigo-600 hover:underline md:inline">
          + novo projeto
        </Link>
      </div>
      <div className="flex items-center gap-3">
        <span className="hidden text-sm text-slate-600 sm:inline">{user.name}</span>
        <button
          onClick={onLogout}
          disabled={loggingOut}
          className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-600 disabled:cursor-wait disabled:opacity-60"
        >
          {loggingOut && <Spinner className="h-3 w-3" />}
          {loggingOut ? "Saindo…" : "Sair"}
        </button>
      </div>
    </header>
  );
}
