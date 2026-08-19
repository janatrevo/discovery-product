"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Card, Field, Input, Label } from "@/components/ui/primitives";

// Tela de "esqueci minha senha". Sempre mostra a mesma mensagem de sucesso,
// exista ou não conta com aquele e-mail — evita que alguém use este
// formulário para descobrir quais e-mails têm conta na ferramenta (ver
// src/app/api/auth/reset-password/route.ts).
export default function EsqueciSenhaPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => {});
    setLoading(false);
    setSent(true);
  }

  if (sent) {
    return (
      <Card>
        <p className="text-sm text-slate-600">
          Se houver uma conta com o e-mail <strong>{email}</strong>, enviamos um link para redefinir a senha.
          Confira sua caixa de entrada (e o spam).
        </p>
        <p className="mt-4 text-center text-sm">
          <Link href="/login" className="font-medium text-indigo-600">
            Voltar para o login
          </Link>
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <form onSubmit={onSubmit}>
        <Field>
          <Label>E-mail</Label>
          <Input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Button type="submit" disabled={loading} className="w-full justify-center">
          {loading ? "Enviando..." : "Enviar link de redefinição"}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-slate-500">
        <Link href="/login" className="font-medium text-indigo-600">
          Voltar para o login
        </Link>
      </p>
    </Card>
  );
}
