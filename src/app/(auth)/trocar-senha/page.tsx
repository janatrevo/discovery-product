"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Field, Input, Label } from "@/components/ui/primitives";

export default function TrocarSenhaPage() {
  const router = useRouter();
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (form.newPassword !== form.confirm) {
      setError("A confirmação não é igual à nova senha.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: form.currentPassword, newPassword: form.newPassword }),
      });
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Não foi possível trocar a senha.");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Sem conexão. Tente de novo.");
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <Card>
      <p className="mb-1 text-base font-semibold text-slate-800">Crie sua senha</p>
      <p className="mb-4 text-sm text-slate-500">
        Você entrou com uma senha temporária. Escolha uma senha só sua para continuar.
      </p>
      <form onSubmit={onSubmit}>
        <Field>
          <Label>Senha temporária (a que você recebeu)</Label>
          <Input
            required
            type="password"
            autoComplete="current-password"
            value={form.currentPassword}
            onChange={(e) => setForm({ ...form, currentPassword: e.target.value })}
          />
        </Field>
        <Field>
          <Label>Nova senha (mín. 8 caracteres)</Label>
          <Input
            required
            minLength={8}
            type="password"
            autoComplete="new-password"
            value={form.newPassword}
            onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
          />
        </Field>
        <Field>
          <Label>Repita a nova senha</Label>
          <Input
            required
            minLength={8}
            type="password"
            autoComplete="new-password"
            value={form.confirm}
            onChange={(e) => setForm({ ...form, confirm: e.target.value })}
          />
        </Field>
        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
        <Button type="submit" disabled={loading} className="w-full justify-center">
          {loading ? "Salvando..." : "Salvar nova senha"}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-slate-500">
        <button type="button" onClick={logout} className="font-medium text-indigo-600">
          Sair
        </button>
      </p>
    </Card>
  );
}
