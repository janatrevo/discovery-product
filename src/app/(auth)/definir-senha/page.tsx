"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Field, Input, Label } from "@/components/ui/primitives";

// Página de destino do link "criar senha" enviado por e-mail via Supabase
// Auth (ver src/lib/supabase-admin.ts). O Supabase entrega o token no
// fragmento #access_token da própria URL — por isso a leitura é client-side.
export default function DefinirSenhaPage() {
  const router = useRouter();
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [linkType, setLinkType] = useState<"invite" | "recovery" | "signup" | null>(null);
  const [status, setStatus] = useState<"checking" | "ready" | "invalid">("checking");
  const [form, setForm] = useState({ name: "", password: "", confirm: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
    const params = new URLSearchParams(hash);
    const token = params.get("access_token");
    const type = params.get("type");
    if (token && (type === "invite" || type === "recovery" || type === "signup")) {
      setAccessToken(token);
      setLinkType(type);
      setStatus("ready");
    } else {
      setStatus("invalid");
    }
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.password !== form.confirm) {
      setError("As senhas não coincidem.");
      return;
    }
    setLoading(true);
    setError(null);
    const res = await fetch("/api/auth/accept-invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken, name: form.name, password: form.password, type: linkType }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Não foi possível criar a senha.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  if (status === "checking") {
    return (
      <Card>
        <p className="text-sm text-slate-500">Verificando convite...</p>
      </Card>
    );
  }

  if (status === "invalid") {
    return (
      <Card>
        <p className="text-sm text-red-600">
          Link inválido ou expirado. Peça um novo convite para o time responsável.
        </p>
      </Card>
    );
  }

  const isRecovery = linkType === "recovery";

  return (
    <Card>
      <form onSubmit={onSubmit}>
        {!isRecovery && (
          <Field>
            <Label>Seu nome</Label>
            <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
        )}
        <Field>
          <Label>{isRecovery ? "Nova senha (mín. 8 caracteres)" : "Criar senha (mín. 8 caracteres)"}</Label>
          <Input
            required
            type="password"
            minLength={8}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </Field>
        <Field>
          <Label>Confirmar senha</Label>
          <Input
            required
            type="password"
            minLength={8}
            value={form.confirm}
            onChange={(e) => setForm({ ...form, confirm: e.target.value })}
          />
        </Field>
        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
        <Button type="submit" disabled={loading} className="w-full justify-center">
          {loading
            ? isRecovery
              ? "Salvando nova senha..."
              : "Criando senha..."
            : isRecovery
              ? "Salvar nova senha e entrar"
              : "Criar senha e entrar"}
        </Button>
      </form>
    </Card>
  );
}
