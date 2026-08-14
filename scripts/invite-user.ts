/**
 * Envia um convite de acesso por e-mail via Supabase Auth (usa o mailer do
 * próprio Supabase — não precisa de nenhum serviço de e-mail adicional).
 * A pessoa recebe um link que cai em /definir-senha para criar a senha e
 * entra com papel "owner" em todos os projetos existentes (ver
 * src/app/api/auth/accept-invite/route.ts).
 *
 * Uso: npx tsx scripts/invite-user.ts email@dominio.com "Nome da pessoa"
 */
import { inviteUserByEmail } from "../src/lib/supabase-admin";

async function main() {
  const email = process.argv[2];
  const name = process.argv[3] || "";
  if (!email) {
    console.error('Uso: npx tsx scripts/invite-user.ts email@dominio.com "Nome"');
    process.exit(1);
  }
  const redirectTo = process.env.INVITE_REDIRECT_URL || "http://localhost:3000/definir-senha";
  const result = await inviteUserByEmail(email, { redirectTo, data: { name } });
  console.log("Convite enviado para", email);
  console.log(result);
}

main().catch((err) => {
  console.error("Erro ao enviar convite:", err.message || err);
  process.exit(1);
});
