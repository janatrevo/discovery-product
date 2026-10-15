"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/primitives";

// Botão de envio de formulário que pede confirmação antes. Usado nas
// exclusões que apagam coisas junto (hipótese, produto): o texto da
// confirmação diz exatamente o que será apagado e o que só será desvinculado.
export function ConfirmSubmitButton({
  message,
  variant = "danger",
  size,
  children,
}: {
  message: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  children: ReactNode;
}) {
  return (
    <Button
      type="submit"
      variant={variant}
      size={size}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </Button>
  );
}
