"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";

type ProjectRow = { project: { id: string; name: string }; role: string };

export function TopBar({
  user,
  projects,
  current,
}: {
  user: { name: string; email: string };
  projects: ProjectRow[];
  current: ProjectRow | null;
}) {
  const router = useRouter();
  const [switching, setSwitching] = useState(false);

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
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-400">Projeto:</span>
        <select
          disabled={switching}
          value={current?.project.id ?? ""}
          onChange={(e) => onSwitch(e.target.value)}
          className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-sm font-medium text-slate-700"
        >
          {projects.map((p) => (
            <option key={p.project.id} value={p.project.id}>
              {p.project.name}
            </option>
          ))}
        </select>
        {current && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium capitalize text-slate-500">
            {current.role}
          </span>
        )}
        <Link href="/settings/projects/new" className="ml-1 text-xs font-medium text-indigo-600 hover:underline">
          + novo projeto
        </Link>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm text-slate-600">{user.name}</span>
        <button onClick={onLogout} className="text-xs font-medium text-slate-400 hover:text-slate-600">
          Sair
        </button>
      </div>
    </header>
  );
}
