"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import {
  LayoutDashboard,
  Lightbulb,
  Target,
  Users,
  Package,
  Library,
  FlaskConical,
  ScrollText,
  FileBarChart,
  Settings,
} from "lucide-react";
import { useProductTour } from "./product-tour";

// Ordem pensada para espelhar o fluxo natural de discovery — não é ordem
// alfabética nem por "importância": você define o que está avaliando
// (Products), quem avalia (Personas), o que quer investigar (Hypotheses),
// como vai investigar (Research), onde tudo isso se consolida (Repository),
// o que virou oportunidade priorizável (Discovery Board) e o que foi
// decidido a partir disso (Decision Log). Ver também <ProductTour />, que
// usa os mesmos data-tour-id para explicar essa ordem a um usuário novo.
const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, tourId: "nav-dashboard" },
  { href: "/products", label: "Products & Concepts", icon: Package, tourId: "nav-products" },
  { href: "/personas", label: "Personas", icon: Users, tourId: "nav-personas" },
  { href: "/hypotheses", label: "Hypotheses", icon: Lightbulb, tourId: "nav-hypotheses" },
  { href: "/research", label: "Research & Testing", icon: FlaskConical, tourId: "nav-research" },
  { href: "/repository", label: "Research Repository", icon: Library, tourId: "nav-repository" },
  { href: "/opportunities", label: "Discovery Board", icon: Target, tourId: "nav-opportunities" },
  { href: "/decisions", label: "Decision Log", icon: ScrollText, tourId: "nav-decisions" },
  { href: "/reports", label: "Reports", icon: FileBarChart, tourId: "nav-reports" },
  { href: "/settings", label: "Settings", icon: Settings, tourId: "nav-settings" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { start } = useProductTour();
  return (
    <aside
      className="flex w-60 shrink-0 flex-col text-white"
      style={{ background: "linear-gradient(180deg, #8B42FF 0%, #6518E5 100%)" }}
    >
      <div className="flex h-14 items-center px-4">
        <Image src="/trevo-logo.png" alt="Trevo" width={110} height={25} priority className="h-6 w-auto" />
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
        {NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              data-tour-id={item.tourId}
              className={clsx(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active ? "bg-white/20 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
              )}
            >
              <Icon size={16} strokeWidth={2} />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-white/15 p-3">
        <button
          onClick={start}
          className="mb-2 w-full rounded-md bg-white/10 px-3 py-2 text-left text-xs font-medium text-white hover:bg-white/20"
        >
          🎓 Ver tour guiado
        </button>
        <p className="text-[11px] leading-snug text-white/60">
          Simulação de IA nunca conta como evidência. Veja sempre a origem do dado antes de decidir.
        </p>
      </div>
    </aside>
  );
}
