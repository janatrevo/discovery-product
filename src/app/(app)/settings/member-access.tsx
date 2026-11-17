"use client";

import { useActionState, useState, useTransition } from "react";
import { Button, Input, Label, Select } from "@/components/ui/primitives";
import {
  createMemberWithTempPassword,
  resetMemberPassword,
  type TempPasswordResult,
} from "./actions";

const initial: TempPasswordResult = { status: "idle" };

function CopyButton({ text, label = "Copiar senha" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          /* sem permissão de área de transferência: a senha está visível para copiar à mão */
        }
      }}
    >
      {copied ? "Copiado!" : label}
    </Button>
  );
}

function PasswordBox({ email, password }: { email: string; password: string }) {
  return (
    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
      <p className="text-sm font-semibold text-amber-900">Senha temporária de {email}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <code className="rounded bg-white px-3 py-1.5 text-lg font-semibold tracking-wide text-slate-800 select-all">
          {password}
        </code>
        <CopyButton text={password} />
      </div>
      <p className="mt-2 text-xs text-amber-800">
        Ela só aparece agora — copie e envie para a pessoa. No primeiro acesso, ela entra com esta senha e
        será obrigada a criar uma senha nova. Se perder, use “gerar nova senha” na lista de membros.
      </p>
    </div>
  );
}

export function CreateAccessForm() {
  const [state, formAction, pending] = useActionState(createMemberWithTempPassword, initial);
  return (
    <div>
      <form action={formAction} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_9rem_auto] sm:items-end">
        <div>
          <Label>Nome</Label>
          <Input name="name" required minLength={2} placeholder="Nome da pessoa" />
        </div>
        <div>
          <Label>E-mail</Label>
          <Input name="email" type="email" required placeholder="nome@empresa.com" />
        </div>
        <div>
          <Label>Papel</Label>
          <Select name="role" defaultValue="contributor">
            <option value="viewer">Viewer</option>
            <option value="contributor">Contributor</option>
            <option value="editor">Editor</option>
            <option value="owner">Owner</option>
          </Select>
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Criando..." : "Criar acesso"}
        </Button>
      </form>

      {state.status === "error" && <p className="mt-3 text-sm text-red-600">{state.message}</p>}
      {state.status === "added" && <p className="mt-3 text-sm text-emerald-700">{state.message}</p>}
      {state.status === "created" && (
        <>
          <p className="mt-3 text-sm text-emerald-700">Acesso criado para {state.name}.</p>
          <PasswordBox email={state.email} password={state.tempPassword} />
        </>
      )}
    </div>
  );
}

export function ResetPasswordButton({ userId, email }: { userId: string; email: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ password?: string; error?: string } | null>(null);
  return (
    <div className="flex flex-col items-end">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await resetMemberPassword(userId);
            setResult(r.ok ? { password: r.tempPassword } : { error: r.message });
          })
        }
      >
        {pending ? "gerando..." : "gerar nova senha"}
      </Button>
      {result?.error && <p className="mt-1 max-w-xs text-right text-xs text-red-600">{result.error}</p>}
      {result?.password && (
        <div className="mt-2 w-full max-w-72 rounded-lg border border-amber-200 bg-amber-50 p-2 text-left">
          <p className="text-xs font-semibold text-amber-900">Nova senha de {email}</p>
          <div className="mt-1 flex items-center gap-2">
            <code className="rounded bg-white px-2 py-1 text-sm font-semibold select-all">{result.password}</code>
            <CopyButton text={result.password} label="Copiar" />
          </div>
          <p className="mt-1 text-[11px] text-amber-800">Aparece só agora. A pessoa terá que trocar no próximo login.</p>
        </div>
      )}
    </div>
  );
}
