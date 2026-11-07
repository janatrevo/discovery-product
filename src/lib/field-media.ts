import { db } from "@/db";
import { fieldObservationMedia } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { FIELD_MEDIA_BUCKET, getSignedUrl } from "@/lib/supabase-storage";

// Fotos e vídeos de um experimento de observação em campo, já com URL
// assinada de leitura (o bucket é privado). Com observationId, só os
// arquivos ligados àquele registro.
export async function getFieldMedia(experimentId: string, observationId?: string) {
  const rows = await db
    .select()
    .from(fieldObservationMedia)
    .where(
      observationId
        ? and(eq(fieldObservationMedia.experimentId, experimentId), eq(fieldObservationMedia.observationId, observationId))
        : eq(fieldObservationMedia.experimentId, experimentId)
    )
    .orderBy(desc(fieldObservationMedia.createdAt));

  return Promise.all(
    rows.map(async (r) => {
      let url: string | null = null;
      try {
        url = await getSignedUrl(FIELD_MEDIA_BUCKET, r.filePath, 60 * 60 * 6);
      } catch {
        url = null;
      }
      return { ...r, url };
    })
  );
}

export type FieldMediaItem = Awaited<ReturnType<typeof getFieldMedia>>[number];
