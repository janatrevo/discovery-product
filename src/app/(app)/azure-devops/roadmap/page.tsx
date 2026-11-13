import Link from "next/link";
import { Button, PageHeader } from "@/components/ui/primitives";
import { RoadmapView } from "@/components/roadmap-view";

export default async function RoadmapPage() {
  return (
    <div>
      <PageHeader
        title="Roadmap — Gráfico Gantt"
        description="Timeline de entregas das Features enviadas ao Azure DevOps, a partir das datas planejadas no discovery-app. Também disponível na aba Gantt do Discovery Board."
        actions={
          <Link href="/azure-devops">
            <Button variant="secondary">← Voltar</Button>
          </Link>
        }
      />
      <RoadmapView />
    </div>
  );
}
