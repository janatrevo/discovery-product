import { NextRequest, NextResponse } from "next/server";
import { setCurrentProjectCookie } from "@/lib/current-project";

export async function POST(req: NextRequest) {
  const { projectId } = await req.json();
  if (!projectId) return NextResponse.json({ error: "projectId obrigatório" }, { status: 400 });
  await setCurrentProjectCookie(projectId);
  return NextResponse.json({ ok: true });
}
