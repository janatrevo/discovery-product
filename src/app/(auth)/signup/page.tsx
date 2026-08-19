"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Card, Field, Input, Label } from "@/components/ui/primitives";

// Cadastro público desativado em produção — ver comentário em
// src/app/api/auth/signup/route.ts. `process.env.NODE_ENV` é substituído
// pelo Next.js em tempo de build, inclusive em componente client como este.
const SIGNUP_DISABLED = process.env.NODE_ENV === "production";

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "", orgName: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (SIGNUP_DISABLED) {
    return (
      <Card>
        <p className="text-sm text-slate-600">
          O cadastro público está desativado — esta é uma ferramenta interna. Peça a um administrador para
          te enviar um convite pela aba Settings.
        </p>
        <p className="mt-4 text-center text-sm text-slate-500">
          <Link href="/login" className="font-medium text-indigo-600">
            Voltar para o login
          </Link>
        </p>
      </Card>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Não foi possível criar a conta.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <Card>
      <form onSubmit={onSubmit}>
        <Field>
          <Label>Seu nome</Label>
          <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field>
          <Label>Nome da organização / time</Label>
          <Input
            required
            placeholder="Ex.: Trevo Produto"
            value={form.orgName}
            onChange={(e) => setForm({ ...form, orgName: e.target.value })}
          />
        </Field>
        <Field>
          <Label>E-mail</Label>
          <Input
            required
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </Field>
        <Field>
          <Label>Senha (mín. 8 caracteres)</Label>
          <Input
            required
            type="password"
            minLength={8}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </Field>
        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
        <Button type="submit" disabled={loading} className="w-full justify-center">
          {loading ? "Criando conta..." : "Criar conta"}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-slate-500">
        Já tem conta?{" "}
        <Link href="/login" className="font-medium text-indigo-600">
          Entrar
        </Link>
      </p>
    </Card>
  );
}
