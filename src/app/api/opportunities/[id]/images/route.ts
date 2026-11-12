import { NextResponse } from "next/server";
import { db } from "@/db";
import { opportunities, opportunityImages } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { getPageContext } from "@/lib/page-context";
import { IMAGE_TYPES, MAX_IMAGE_BYTES, MAX_IMAGES_PER_OPPORTUNITY, titleFromFileName } from "@/lib/opportunity-images";

// Recebe UMA imagem por requisição (a tela envia uma de cada vez quando o usuário
// escolhe várias). Usa rota de API em vez de Server Action para não esbarrar no
// limite de 1 MB do corpo de Server Actions.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, project, role } = await getPageContext();
  if (role === "viewer") return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

  const [opp] = await db.select({ id: opportunities.id, projectId: opportunities.projectId }).from(opportunities).where(eq(opportunities.id, id)).limit(1);
  if (!opp || opp.projectId !== project.id) return NextResponse.json({ error: "Oportunidade não encontrada." }, { status: 404 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Não consegui ler o arquivo enviado." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Escolha uma imagem." }, { status: 400 });
  if (!IMAGE_TYPES[file.type]) {
    return NextResponse.json({ error: "Formato não aceito. Use PNG, JPG, WEBP ou GIF." }, { status: 400 });
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: `A imagem tem ${(file.size / 1e6).toFixed(1)} MB; o máximo é 4 MB.` }, { status: 400 });
  }
  if (file.size === 0) return NextResponse.json({ error: "O arquivo está vazio." }, { status: 400 });

  const [{ count, max }] = await db
    .select({ count: sql<number>`count(*)::int`, max: sql<number>`coalesce(max(${opportunityImages.orderIndex}), -1)::int` })
    .from(opportunityImages)
    .where(eq(opportunityImages.opportunityId, id));
  if ((count ?? 0) >= MAX_IMAGES_PER_OPPORTUNITY) {
    return NextResponse.json({ error: `Limite de ${MAX_IMAGES_PER_OPPORTUNITY} imagens por oportunidade.` }, { status: 400 });
  }

  const rawTitle = String(form.get("title") ?? "").trim();
  const title = (rawTitle || titleFromFileName(file.name) || "Imagem").slice(0, 160);
  const fileName = (file.name || `imagem.${IMAGE_TYPES[file.type]}`).replace(/[\\/:*?"<>|]+/g, "_").slice(0, 200);

  const [row] = await db
    .insert(opportunityImages)
    .values({
      opportunityId: id,
      title,
      fileName,
      mimeType: file.type,
      sizeBytes: file.size,
      data: Buffer.from(await file.arrayBuffer()),
      orderIndex: (max ?? -1) + 1,
      createdBy: user.id,
    })
    .returning({ id: opportunityImages.id });

  return NextResponse.json({ ok: true, id: row.id });
}
