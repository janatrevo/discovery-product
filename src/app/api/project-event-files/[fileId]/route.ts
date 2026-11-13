import { NextResponse } from "next/server";
import { db } from "@/db";
import { projectEventFiles } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getPageContext } from "@/lib/page-context";
import { getSignedUrl, PROJECT_FILES_BUCKET } from "@/lib/supabase-storage";

// Baixa um anexo do calendário. Só para quem está logado e é do projeto do arquivo:
// gera um link temporário (5 min) do bucket privado e redireciona para ele.
export async function GET(_req: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;
  const { project } = await getPageContext();
  const [f] = await db
    .select()
    .from(projectEventFiles)
    .where(and(eq(projectEventFiles.id, fileId), eq(projectEventFiles.projectId, project.id)))
    .limit(1);
  if (!f) return NextResponse.json({ error: "not found" }, { status: 404 });
  try {
    const url = await getSignedUrl(PROJECT_FILES_BUCKET, f.filePath, 300);
    return NextResponse.redirect(`${url}${url.includes("?") ? "&" : "?"}download=${encodeURIComponent(f.fileName)}`);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao abrir o arquivo." }, { status: 502 });
  }
}
