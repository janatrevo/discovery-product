import { getPageContext } from "@/lib/page-context";
import { db } from "@/db";
import { projectMemberships, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { Badge, Button, Card, Field, Input, Label, PageHeader } from "@/components/ui/primitives";
import { updateThresholds, removeMember } from "./actions";
import { CreateAccessForm, ResetPasswordButton } from "./member-access";
import Link from "next/link";

export default async function SettingsPage() {
  const { user, project, role } = await getPageContext();

  const members = await db
    .select({ user: users, role: projectMemberships.role })
    .from(projectMemberships)
    .innerJoin(users, eq(users.id, projectMemberships.userId))
    .where(eq(projectMemberships.projectId, project.id));

  return (
    <div className="page-masonry">
      <PageHeader
        title="Settings"
        description="Configurações do projeto, membros e limiares de confiança."
        actions={
          <Link href="/settings/projects/new">
            <Button variant="secondary">+ Novo projeto</Button>
          </Link>
        }
      />

      <Card>
        <p className="mb-3 text-sm font-semibold text-slate-700">Projeto e limiares</p>
        <form action={updateThresholds} className="space-y-3">
          <Field>
            <Label>Nome do projeto</Label>
            <Input name="name" defaultValue={project.name} disabled={role !== "owner"} />
          </Field>
          <Field>
            <Label>Descrição</Label>
            <Input name="description" defaultValue={project.description ?? ""} disabled={role !== "owner"} />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field>
              <Label>Confiança p/ Validated (%)</Label>
              <Input
                name="confidenceValidatedThreshold"
                type="number"
                min={0}
                max={100}
                defaultValue={project.confidenceValidatedThreshold}
                disabled={role !== "owner"}
              />
            </Field>
            <Field>
              <Label>Amostra mín. survey</Label>
              <Input
                name="minSampleSurvey"
                type="number"
                min={1}
                defaultValue={project.minSampleSurvey}
                disabled={role !== "owner"}
              />
            </Field>
            <Field>
              <Label>Amostra mín. entrevistas</Label>
              <Input
                name="minSampleInterview"
                type="number"
                min={1}
                defaultValue={project.minSampleInterview}
                disabled={role !== "owner"}
              />
            </Field>
          </div>
          <p className="text-xs text-slate-400">
            Os mínimos estruturais (2 fontes independentes, override rastreado) não são
            configuráveis — só estes limiares numéricos.
          </p>
          {role === "owner" && <Button type="submit">Salvar</Button>}
        </form>
      </Card>

      <Card>
        <p className="mb-3 text-sm font-semibold text-slate-700">Membros do projeto</p>
        <ul className="mb-4 divide-y divide-slate-100">
          {members.map((m) => (
            <li key={m.user.id} className="flex items-start justify-between gap-3 py-2">
              <div>
                <p className="text-sm text-slate-700">{m.user.name}</p>
                <p className="text-xs text-slate-400">{m.user.email}</p>
              </div>
              <div className="flex items-start gap-2">
                {m.user.mustChangePassword && <Badge color="amber">senha temporária</Badge>}
                <Badge color="indigo">{m.role}</Badge>
                {role === "owner" && m.user.id !== user.id && (
                  <ResetPasswordButton userId={m.user.id} email={m.user.email} />
                )}
                {role === "owner" && (
                  <form action={removeMember.bind(null, m.user.id)}>
                    <Button type="submit" size="sm" variant="ghost">
                      remover
                    </Button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
        {role === "owner" && <CreateAccessForm />}
        {role === "owner" && (
          <p className="mt-3 text-xs text-slate-400">
            Criamos a conta na hora e mostramos uma senha temporária para você enviar à pessoa. No primeiro
            acesso ela é obrigada a trocar por uma senha própria.
          </p>
        )}
      </Card>
    </div>
  );
}
