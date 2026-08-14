import Link from "next/link";
import { getPageContext } from "@/lib/page-context";
import { db } from "@/db";
import { reports } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { Button, Card, EmptyState, PageHeader } from "@/components/ui/primitives";

export default async function ReportsPage() {
  const { project } = await getPageContext();
  const list = await db.select().from(reports).where(eq(reports.projectId, project.id)).orderBy(desc(reports.createdAt));

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Reports"
        description="Snapshots do estado do discovery — geradas diretamente dos dados do projeto, nunca por IA, para servir como registro confiável de um momento no tempo."
        actions={
          <Link href="/reports/new">
            <Button>+ Gerar relatório</Button>
          </Link>
        }
      />

      {list.length === 0 ? (
        <EmptyState
          title="Nenhum relatório gerado ainda"
          description="Gere um snapshot do estado atual de hipóteses, oportunidades e decisões para compartilhar com stakeholders."
          action={
            <Link href="/reports/new">
              <Button>Gerar primeiro relatório</Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {list.map((r) => (
            <Link key={r.id} href={`/reports/${r.id}`}>
              <Card className="hover:shadow-md">
                <p className="text-sm font-medium text-slate-900">{r.title}</p>
                <p className="mt-1 text-xs text-slate-400">{new Date(r.createdAt).toLocaleString("pt-BR")}</p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
