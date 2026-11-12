import { NextResponse } from "next/server";
import { db } from "@/db";
import { opportunities, opportunityImages } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getPageContext } from "@/lib/page-context";
import { IMAGE_TYPES } from "@/lib/opportunity-images";

// Entrega a imagem para a tela do PRD. Só para quem está logado e é do projeto da oportunidade.
export async function GET(_req: Request, { params }: { params: Promise<{ imageId: string }> }) {
  const { imageId } = await params;
  const { project } = await getPageContext();

  const [row] = await db
    .select({
      data: opportunityImages.data,
      mimeType: opportunityImages.mimeType,
      projectId: opportunities.projectId,
    })
    .from(opportunityImages)
    .innerJoin(opportunities, eq(opportunities.id, opportunityImages.opportunityId))
    .where(eq(opportunityImages.id, imageId))
    .limit(1);

  if (!row || row.projectId !== project.id || !IMAGE_TYPES[row.mimeType]) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(row.data), {
    headers: {
      "Content-Type": row.mimeType,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
