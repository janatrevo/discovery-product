import { randomInt } from "node:crypto";

// Senha temporária legível: sem caracteres que se confundem (0/O, 1/l/I) e em
// dois blocos para facilitar ditar por telefone/WhatsApp. Ex.: "Kp7mQ-4tXwR2".
const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateTempPassword(): string {
  const pick = (n: number) =>
    Array.from({ length: n }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `${pick(5)}-${pick(6)}`;
}
